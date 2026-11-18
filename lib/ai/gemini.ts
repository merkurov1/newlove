import {
  assertCircuitClosed,
  recordCircuitFailure,
  recordCircuitSuccess,
} from '@/lib/operations/circuitBreaker';
import {
  buildLlmCallRecord,
  createTelemetryStore,
  recordLlmCall,
  type LlmCallContext,
  type LlmProviderAttempt,
  type LlmSurface,
} from '@/lib/ai/telemetry';

/**
 * Optional per-call telemetry context for Gemini callers outside the Pierrot
 * route. The Pierrot route records its own richer multi-provider attempts, so
 * it sets `skip` to avoid double-counting.
 */
export type GeminiTelemetryContext = Partial<Omit<LlmCallContext, 'surface'>> & {
  surface?: LlmSurface;
  skip?: boolean;
};

/**
 * Gemini is the primary model for Pierrot, Flow item context and Flow issue
 * analysis. DeepSeek remains the automatic fallback in each caller.
 *
 * The model is pinned so a provider-side alias change cannot silently alter
 * cost or output quality. `GEMINI_API_KEY` already exists in the project;
 * no additional configuration is required.
 */
export const GEMINI_MODEL = 'gemini-3.5-flash';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type GeminiTextResult = {
  content: string;
  model: string;
  provider: 'gemini';
  latencyMs: number;
  finishReason?: string | null;
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  } | null;
};

export type GeminiStreamResult = GeminiTextResult & {
  emitted: boolean;
};

export class GeminiError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(message: string, code: string, status: number | null = null) {
    super(message);
    this.name = 'GeminiError';
    this.code = code;
    this.status = status;
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean((process.env.GEMINI_API_KEY || '').trim());
}

function geminiUsageForTelemetry(value: unknown): LlmProviderAttempt['usage'] {
  if (!value || typeof value !== 'object') {
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      usageSource: 'unknown',
      providerReportedCostUsd: null,
    };
  }

  const usage = value as Record<string, unknown>;
  const read = (key: string): number | null =>
    typeof usage[key] === 'number' && Number.isFinite(usage[key]) ? (usage[key] as number) : null;
  const input = read('promptTokenCount');
  const output = read('candidatesTokenCount');

  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens:
      read('totalTokenCount') ??
      (input !== null || output !== null ? (input ?? 0) + (output ?? 0) : null),
    usageSource:
      input === null && output === null
        ? 'unknown'
        : input !== null && output !== null
          ? 'provider_reported'
          : 'partial',
    providerReportedCostUsd: null,
  };
}

async function persistGeminiAttempt(input: {
  telemetry?: GeminiTelemetryContext;
  startedAt: number;
  ok: boolean;
  finishReason: string | null;
  errorCode: string | null;
  usage: unknown;
  promptChars: number;
  responseChars: number;
}): Promise<void> {
  const telemetry = input.telemetry;
  if (telemetry?.skip) return;
  // Unit tests often queue global.fetch responses. Auto-persisting every
  // Gemini call there would consume those fixtures; tests that need coverage
  // pass an explicit telemetry object.
  if (process.env.NODE_ENV === 'test' && !telemetry) return;

  try {
    const store = createTelemetryStore();
    if (!store) return;

    const attempt: LlmProviderAttempt = {
      provider: 'gemini',
      model: GEMINI_MODEL,
      attempt: 1,
      isRetry: false,
      fallbackFrom: null,
      ok: input.ok,
      latencyMs: Math.max(0, Date.now() - input.startedAt),
      finishReason: input.finishReason,
      errorCode: input.errorCode,
      usage: geminiUsageForTelemetry(input.usage),
      promptChars: input.promptChars,
      responseChars: input.responseChars,
    };

    const record = buildLlmCallRecord({
      context: {
        requestId: telemetry?.requestId ?? null,
        conversationId: telemetry?.conversationId ?? null,
        sessionId: telemetry?.sessionId ?? null,
        userId: telemetry?.userId ?? null,
        surface: telemetry?.surface ?? 'unknown',
      },
      attempt,
    });

    await recordLlmCall(store, record);
  } catch {
    // Telemetry must never fail a generation path.
  }
}

function geminiPromptChars(input: {
  system?: string;
  prompt?: string;
  messages?: GeminiMessage[];
}): number {
  return (
    (input.system?.length ?? 0) +
    (input.prompt?.length ?? 0) +
    (input.messages ?? []).reduce((total, message) => total + message.content.length, 0)
  );
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    message?: string;
  };
};

function extractText(payload: GeminiResponse): string {
  return (payload.candidates?.[0]?.content?.parts || [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('');
}

function extractSseData(frame: string): string[] {
  return frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .filter(Boolean);
}

function geminiRequestBody(input: {
  system?: string;
  prompt?: string;
  messages?: GeminiMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}) {
  const contents =
    input.messages && input.messages.length > 0
      ? input.messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        }))
      : [{ role: 'user', parts: [{ text: input.prompt || '' }] }];

  return {
    ...(input.system ? { systemInstruction: { parts: [{ text: input.system }] } } : {}),
    contents,
    generationConfig: {
      temperature: input.temperature ?? 0.4,
      maxOutputTokens: input.maxOutputTokens ?? 700,
      // Keep output tokens for the actual answer. Without this, newer Flash
      // models can spend the whole budget on hidden reasoning and return a
      // truncated answer.
      thinkingConfig: { thinkingBudget: 0 },
      ...(input.responseMimeType ? { responseMimeType: input.responseMimeType } : {}),
    },
  };
}

/**
 * One bounded Gemini call. The caller owns the fallback decision.
 *
 * This function never logs the prompt, history or response. Callers log only
 * the provider, model, latency and a short error code.
 */
export async function generateGeminiText(input: {
  system?: string;
  prompt?: string;
  messages?: GeminiMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  responseMimeType?: string;
  signal?: AbortSignal;
  telemetry?: GeminiTelemetryContext;
}): Promise<GeminiTextResult> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (!apiKey) {
    throw new GeminiError('Gemini is not configured.', 'gemini_not_configured');
  }

  await assertCircuitClosed('gemini');

  const startedAt = Date.now();
  const timeoutMs = input.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const relayAbort = () => controller.abort();

  if (input.signal) {
    if (input.signal.aborted) controller.abort();
    else input.signal.addEventListener('abort', relayAbort, { once: true });
  }

  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(geminiRequestBody(input)),
        signal: controller.signal,
        cache: 'no-store',
      }
    );

    const payload = (await response.json().catch(() => null)) as GeminiResponse | null;

    if (!response.ok) {
      const code = `gemini_http_${response.status}`;

      await recordCircuitFailure({
        dependency: 'gemini',
        errorCode: code,
        permanent: [400, 401, 403, 404].includes(response.status),
      });

      throw new GeminiError(
        payload?.error?.message || 'Gemini request failed.',
        code,
        response.status
      );
    }

    const content = extractText(payload || {}).trim();

    if (!content) {
      await recordCircuitFailure({
        dependency: 'gemini',
        errorCode: 'gemini_empty_response',
        permanent: false,
      });

      throw new GeminiError('Gemini returned an empty response.', 'gemini_empty_response');
    }

    await recordCircuitSuccess('gemini');
    await persistGeminiAttempt({
      telemetry: input.telemetry,
      startedAt,
      ok: true,
      finishReason: payload?.candidates?.[0]?.finishReason ?? null,
      errorCode: null,
      usage: payload?.usageMetadata ?? null,
      promptChars: geminiPromptChars(input),
      responseChars: content.length,
    });

    return {
      content,
      model: GEMINI_MODEL,
      provider: 'gemini',
      latencyMs: Date.now() - startedAt,
      finishReason: payload?.candidates?.[0]?.finishReason ?? null,
      usage: payload?.usageMetadata ?? null,
    };
  } catch (error) {
    const errorCode =
      error instanceof GeminiError
        ? error.code
        : input.signal?.aborted
          ? 'gemini_cancelled'
          : error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
            ? 'gemini_timeout'
            : 'gemini_request_failed';

    await persistGeminiAttempt({
      telemetry: input.telemetry,
      startedAt,
      ok: false,
      finishReason: null,
      errorCode,
      usage: null,
      promptChars: geminiPromptChars(input),
      responseChars: 0,
    });

    if (error instanceof GeminiError) throw error;

    if (input.signal?.aborted) {
      throw new GeminiError('Gemini request cancelled.', 'gemini_cancelled');
    }

    const aborted =
      error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
    const code = aborted ? 'gemini_timeout' : 'gemini_request_failed';

    await recordCircuitFailure({
      dependency: 'gemini',
      errorCode: code,
      permanent: false,
    });

    throw new GeminiError(aborted ? 'Gemini request timed out.' : 'Gemini request failed.', code);
  } finally {
    clearTimeout(timer);
    if (input.signal) input.signal.removeEventListener('abort', relayAbort);
  }
}

/**
 * Genuine Gemini streaming using streamGenerateContent + SSE.
 *
 * The caller owns fallback: if this throws before `emitted` becomes true, the
 * model router may try the next provider. If it throws after text was emitted,
 * the caller must report an interrupted response instead of appending another
 * provider's answer.
 */
export async function streamGeminiText(input: {
  system?: string;
  prompt?: string;
  messages?: GeminiMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  responseMimeType?: string;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  telemetry?: GeminiTelemetryContext;
}): Promise<GeminiStreamResult> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (!apiKey) {
    throw new GeminiError('Gemini is not configured.', 'gemini_not_configured');
  }

  await assertCircuitClosed('gemini');

  const startedAt = Date.now();
  const timeoutMs = input.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const relayAbort = () => controller.abort();

  if (input.signal) {
    if (input.signal.aborted) controller.abort();
    else input.signal.addEventListener('abort', relayAbort, { once: true });
  }

  let emitted = false;
  let content = '';
  let finishReason: string | null = null;
  let usage: GeminiTextResult['usage'] = null;

  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(GEMINI_MODEL)}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(geminiRequestBody(input)),
        signal: controller.signal,
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
      const code = `gemini_http_${response.status}`;

      await recordCircuitFailure({
        dependency: 'gemini',
        errorCode: code,
        permanent: [400, 401, 403, 404].includes(response.status),
      });

      throw new GeminiError(
        payload?.error?.message || 'Gemini request failed.',
        code,
        response.status
      );
    }

    if (!response.body) {
      throw new GeminiError('Gemini returned an empty stream.', 'gemini_empty_response');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const consumeFrame = (frame: string) => {
      for (const data of extractSseData(frame)) {
        if (data === '[DONE]') continue;

        let payload: GeminiResponse | null = null;
        try {
          payload = JSON.parse(data) as GeminiResponse;
        } catch {
          throw new GeminiError('Gemini returned a malformed stream.', 'gemini_stream_malformed');
        }

        if (payload?.error) {
          throw new GeminiError(
            payload.error.message || 'Gemini stream failed.',
            'gemini_stream_error'
          );
        }

        if (payload?.candidates?.[0]?.finishReason) {
          finishReason = payload.candidates[0].finishReason;
        }
        if (payload?.usageMetadata) usage = payload.usageMetadata;

        const text = extractText(payload || {});
        if (!text) continue;

        content += text;
        emitted = true;
        input.onDelta(text);
      }
    };

    try {
      let done = false;

      while (!done) {
        const read = await reader.read();
        done = read.done;
        if (done) break;

        buffer += decoder.decode(read.value, { stream: true }).replace(/\r\n/g, '\n');

        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (frame.trim()) consumeFrame(frame);
          boundary = buffer.indexOf('\n\n');
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) consumeFrame(buffer.replace(/\r\n/g, '\n'));
    } finally {
      reader.releaseLock();
    }

    if (!content.trim()) {
      await recordCircuitFailure({
        dependency: 'gemini',
        errorCode: 'gemini_empty_response',
        permanent: false,
      });

      throw new GeminiError('Gemini returned an empty response.', 'gemini_empty_response');
    }

    await recordCircuitSuccess('gemini');
    await persistGeminiAttempt({
      telemetry: input.telemetry,
      startedAt,
      ok: true,
      finishReason,
      errorCode: null,
      usage,
      promptChars: geminiPromptChars(input),
      responseChars: content.length,
    });

    return {
      content: content.trim(),
      model: GEMINI_MODEL,
      provider: 'gemini',
      latencyMs: Date.now() - startedAt,
      emitted,
      finishReason,
      usage,
    };
  } catch (error) {
    const errorCode =
      error instanceof GeminiError
        ? error.code
        : error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
          ? 'gemini_timeout'
          : 'gemini_request_failed';

    await persistGeminiAttempt({
      telemetry: input.telemetry,
      startedAt,
      ok: false,
      finishReason,
      errorCode,
      usage: null,
      promptChars: geminiPromptChars(input),
      responseChars: content.length,
    });

    if (error instanceof GeminiError) throw error;

    const aborted =
      error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
    const code = aborted ? 'gemini_timeout' : 'gemini_request_failed';

    await recordCircuitFailure({
      dependency: 'gemini',
      errorCode: code,
      permanent: false,
    });

    throw new GeminiError(aborted ? 'Gemini request timed out.' : 'Gemini request failed.', code);
  } finally {
    clearTimeout(timer);
    if (input.signal) input.signal.removeEventListener('abort', relayAbort);
  }
}
