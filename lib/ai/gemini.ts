import {
  assertCircuitClosed,
  recordCircuitFailure,
  recordCircuitSuccess,
} from '@/lib/operations/circuitBreaker';

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

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

function extractText(payload: GeminiResponse): string {
  return (payload.candidates?.[0]?.content?.parts || [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
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

  const contents =
    input.messages && input.messages.length > 0
      ? input.messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        }))
      : [{ role: 'user', parts: [{ text: input.prompt || '' }] }];

  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          ...(input.system
            ? { systemInstruction: { parts: [{ text: input.system }] } }
            : {}),
          contents,
          generationConfig: {
            temperature: input.temperature ?? 0.4,
            maxOutputTokens: input.maxOutputTokens ?? 700,
            // Keep output tokens for the actual answer. Without this, newer
            // Flash models can spend the whole budget on hidden reasoning and
            // return a truncated bilingual answer.
            thinkingConfig: { thinkingBudget: 0 },
            ...(input.responseMimeType
              ? { responseMimeType: input.responseMimeType }
              : {}),
          },
        }),
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

    const content = extractText(payload || {});

    if (!content) {
      await recordCircuitFailure({
        dependency: 'gemini',
        errorCode: 'gemini_empty_response',
        permanent: false,
      });

      throw new GeminiError('Gemini returned an empty response.', 'gemini_empty_response');
    }

    await recordCircuitSuccess('gemini');

    return {
      content,
      model: GEMINI_MODEL,
      provider: 'gemini',
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof GeminiError) throw error;

    const aborted =
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError');
    const code = aborted ? 'gemini_timeout' : 'gemini_request_failed';

    await recordCircuitFailure({
      dependency: 'gemini',
      errorCode: code,
      permanent: false,
    });

    throw new GeminiError(
      aborted ? 'Gemini request timed out.' : 'Gemini request failed.',
      code
    );
  } finally {
    clearTimeout(timer);
    if (input.signal) input.signal.removeEventListener('abort', relayAbort);
  }
}
