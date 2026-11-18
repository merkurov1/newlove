import OpenAI from 'openai';
import {
  buildLlmCallRecord,
  createTelemetryStore,
  recordLlmCall,
  type LlmProviderAttempt,
  type LlmSurface,
} from '@/lib/ai/telemetry';

const DEFAULT_MODEL = 'deepseek-chat';

export type GraphTelemetryOptions = {
  surface?: LlmSurface;
  requestId?: string | null;
  skip?: boolean;
};

export type GraphChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  json?: boolean;
  telemetry?: GraphTelemetryOptions;
};

export function getGraphModel(): string {
  return (process.env.BRAIN_GRAPH_MODEL || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL).trim();
}

export function isGraphLlmConfigured(): boolean {
  return Boolean((process.env.DEEPSEEK_API_KEY || '').trim());
}

function createClient(timeoutMs: number): OpenAI {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();

  if (!apiKey) throw new Error('deepseek_not_configured');

  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    timeout: timeoutMs,
    maxRetries: 0,
  });
}

async function persistGraphAttempt(input: {
  telemetry?: GraphTelemetryOptions;
  startedAt: number;
  ok: boolean;
  model: string;
  usage: unknown;
  errorCode: string | null;
  promptChars: number;
  responseChars: number;
}): Promise<void> {
  if (input.telemetry?.skip) return;
  if (process.env.NODE_ENV === 'test' && !input.telemetry) return;

  try {
    const store = createTelemetryStore();
    if (!store) return;

    const usage = input.usage as Record<string, unknown> | null | undefined;
    const read = (key: string): number | null =>
      usage && typeof usage[key] === 'number' && Number.isFinite(usage[key])
        ? (usage[key] as number)
        : null;
    const inputTokens = read('prompt_tokens');
    const outputTokens = read('completion_tokens');

    const attempt: LlmProviderAttempt = {
      provider: 'deepseek',
      model: input.model,
      attempt: 1,
      isRetry: false,
      fallbackFrom: null,
      ok: input.ok,
      latencyMs: Math.max(0, Date.now() - input.startedAt),
      finishReason: null,
      errorCode: input.errorCode,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: read('total_tokens'),
        usageSource:
          inputTokens === null && outputTokens === null
            ? 'unknown'
            : inputTokens !== null && outputTokens !== null
              ? 'provider_reported'
              : 'partial',
        providerReportedCostUsd: null,
      },
      promptChars: input.promptChars,
      responseChars: input.responseChars,
    };

    await recordLlmCall(
      store,
      buildLlmCallRecord({
        context: {
          requestId: input.telemetry?.requestId ?? null,
          conversationId: null,
          sessionId: null,
          userId: null,
          surface: input.telemetry?.surface ?? 'unknown',
        },
        attempt,
      })
    );
  } catch {
    // Telemetry must never fail an analysis or ingestion path.
  }
}

async function complete(
  system: string,
  user: string,
  options: GraphChatOptions = {}
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const client = createClient(timeoutMs);
  const model = options.model || getGraphModel();
  const startedAt = Date.now();

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: options.temperature ?? 0,
      max_tokens: options.maxTokens ?? 4096,
      ...(options.json === false ? {} : { response_format: { type: 'json_object' } }),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content || !content.trim()) {
      throw new Error('deepseek_empty_response');
    }

    await persistGraphAttempt({
      telemetry: options.telemetry,
      startedAt,
      ok: true,
      model,
      usage: response.usage,
      errorCode: null,
      promptChars: system.length + user.length,
      responseChars: content.length,
    });

    return content.trim();
  } catch (error) {
    await persistGraphAttempt({
      telemetry: options.telemetry,
      startedAt,
      ok: false,
      model,
      usage: null,
      errorCode: safeGraphErrorCode(error),
      promptChars: system.length + user.length,
      responseChars: 0,
    });
    throw error;
  }
}

function safeGraphErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(message) ? message : 'deepseek_request_failed';
}

export async function graphChatJson(
  system: string,
  user: string,
  options: GraphChatOptions = {}
): Promise<unknown> {
  const raw = await complete(system, user, { ...options, json: true });

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        // Fall through.
      }
    }

    throw new Error('deepseek_invalid_json');
  }
}

export async function graphChatText(
  system: string,
  user: string,
  options: GraphChatOptions = {}
): Promise<string> {
  return complete(system, user, { ...options, json: false });
}
