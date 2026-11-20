import OpenAI from 'openai';
import { generateGeminiText, isGeminiConfigured, streamGeminiText } from '@/lib/ai/gemini';
import type {
  LlmProvider,
  LlmProviderAttempt,
  LlmTokenUsage,
  LlmUsageSource,
} from '@/lib/ai/telemetry';
import { globalLimits } from '@/lib/operations/config';
import { PIERROT_PROVIDER_OUTPUT_CAP } from './generationPolicy';
import {
  assertCircuitClosed,
  recordCircuitFailure,
  recordCircuitSuccess,
} from '@/lib/operations/circuitBreaker';

export type PierrotModelOptions = {
  maxOutputTokens?: number;
  timeoutMs?: number;
  /**
   * Called once per provider attempt, including failures. The route uses this
   * to persist one telemetry row per attempt without exposing prompt text.
   */
  onAttempt?: (attempt: LlmProviderAttempt) => void;
};

export type PierrotTokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type PierrotAttemptUsage = PierrotTokenUsage & {
  usageSource: LlmUsageSource;
  providerReportedCostUsd: number | null;
};

function outputBudget(options: PierrotModelOptions = {}): number {
  const requested = options.maxOutputTokens ?? globalLimits().pierrotLlmMaxTokens;
  return Math.max(100, Math.min(PIERROT_PROVIDER_OUTPUT_CAP, Math.trunc(requested)));
}

function providerTimeout(options: PierrotModelOptions = {}): number {
  return Math.max(
    5_000,
    Math.min(180_000, Math.trunc(options.timeoutMs ?? globalLimits().pierrotLlmTimeoutMs))
  );
}

function usageFrom(value: unknown): PierrotAttemptUsage | null {
  if (!value || typeof value !== 'object') return null;
  const usage = value as Record<string, unknown>;
  const read = (key: string): number | null =>
    typeof usage[key] === 'number' && Number.isFinite(usage[key]) ? (usage[key] as number) : null;

  const promptTokens = read('prompt_tokens') ?? read('promptTokenCount');
  const completionTokens = read('completion_tokens') ?? read('candidatesTokenCount');
  const reportedTotal = read('total_tokens') ?? read('totalTokenCount');
  const totalTokens =
    reportedTotal ??
    (promptTokens !== null || completionTokens !== null
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : null);
  const providerCost = read('cost') ?? read('total_cost') ?? read('provider_cost') ?? null;

  const usageSource: LlmUsageSource =
    promptTokens === null && completionTokens === null && totalTokens === null
      ? 'unknown'
      : promptTokens !== null && completionTokens !== null
        ? 'provider_reported'
        : 'partial';

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    usageSource,
    providerReportedCostUsd: providerCost,
  };
}

const UNKNOWN_ATTEMPT_USAGE: PierrotAttemptUsage = {
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  usageSource: 'unknown',
  providerReportedCostUsd: null,
};

function promptChars(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): number {
  return [systemPrompt, ...messages.map((message) => serializeContent(message.content))].reduce(
    (total, part) => total + part.length,
    0
  );
}

function serializeContent(content: unknown): string {
  if (typeof content === 'string') return content;
  try {
    return JSON.stringify(content);
  } catch {
    return '';
  }
}

function attemptUsage(usage: PierrotAttemptUsage | null): PierrotAttemptUsage {
  return usage ?? UNKNOWN_ATTEMPT_USAGE;
}

function toTelemetryUsage(usage: PierrotAttemptUsage | null): LlmTokenUsage {
  const value = attemptUsage(usage);
  return {
    inputTokens: value.promptTokens,
    outputTokens: value.completionTokens,
    totalTokens: value.totalTokens,
    usageSource: value.usageSource,
    providerReportedCostUsd: value.providerReportedCostUsd,
  };
}

function errorCodeFrom(error: unknown): string {
  if (!error || typeof error !== 'object') return 'provider_request_failed';
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && code.trim()) return code.slice(0, 120);
  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number' && Number.isInteger(status)) return `http_${status}`;
  const message = error instanceof Error ? error.message : '';
  // Store a stable code, never a free-form provider message that may echo a
  // prompt or a request body.
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(message) ? message : 'provider_request_failed';
}

function streamAbortError(): Error {
  const error = new Error('The response stream was cancelled.');
  error.name = 'AbortError';
  return error;
}

export class PierrotStreamInterruptedError extends Error {
  readonly provider: 'gemini' | 'deepseek' | 'openrouter';

  constructor(provider: 'gemini' | 'deepseek' | 'openrouter') {
    super('The response stream was interrupted after output started.');
    this.name = 'PierrotStreamInterruptedError';
    this.provider = provider;
  }
}

// Helper to invoke DeepSeek
async function callDeepSeek(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean = false,
  options: PierrotModelOptions = {}
): Promise<{
  reply: string;
  finishReason: string | null;
  usage: PierrotAttemptUsage | null;
}> {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured.');
  }

  await assertCircuitClosed('pierrot_llm');
  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
    timeout: providerTimeout(options),
    maxRetries: 0,
  });

  const model = isReasoning ? 'deepseek-reasoner' : 'deepseek-chat';

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: isReasoning ? undefined : 0.7,
      max_tokens: outputBudget(options),
    });

    const reply = completion.choices[0]?.message?.content;
    if (!reply) {
      throw new Error('DeepSeek returned empty response.');
    }

    await recordCircuitSuccess('pierrot_llm');
    return {
      reply: reply.trim(),
      finishReason: completion.choices[0]?.finish_reason ?? null,
      usage: usageFrom(completion.usage),
    };
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    const permanent = typeof status === 'number' && [400, 401, 402, 403, 404].includes(status);

    await recordCircuitFailure({
      dependency: 'pierrot_llm',
      errorCode: error instanceof Error ? error.message.slice(0, 120) : 'deepseek_request_failed',
      permanent,
    });

    throw error;
  }
}

async function streamDeepSeek(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  options: PierrotModelOptions = {}
): Promise<{
  reply: string;
  provider: 'deepseek';
  model: string;
  finishReason: string | null;
  usage: PierrotAttemptUsage | null;
}> {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured.');
  }

  await assertCircuitClosed('pierrot_llm');
  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
    timeout: providerTimeout(options),
    maxRetries: 0,
  });

  const model = isReasoning ? 'deepseek-reasoner' : 'deepseek-chat';
  let content = '';
  let finishReason: string | null = null;
  let usage: PierrotAttemptUsage | null = null;

  try {
    const stream = await client.chat.completions.create(
      {
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: isReasoning ? undefined : 0.7,
        max_tokens: outputBudget(options),
        stream: true,
        // OpenAI-compatible providers only emit the final usage frame when it
        // is explicitly requested. Without this every streaming call looks
        // free in telemetry.
        stream_options: { include_usage: true },
      },
      { signal }
    );

    for await (const chunk of stream) {
      if (chunk.choices[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }
      if (chunk.usage) usage = usageFrom(chunk.usage);
      const text = chunk.choices[0]?.delta?.content;
      if (!text) continue;
      content += text;
      onDelta(text);
    }

    if (!content.trim()) {
      throw new Error('DeepSeek returned empty response.');
    }

    await recordCircuitSuccess('pierrot_llm');
    return {
      reply: content.trim(),
      provider: 'deepseek',
      model,
      finishReason,
      usage,
    };
  } catch (error) {
    if (signal?.aborted) throw error;

    const status = (error as { status?: unknown } | null)?.status;
    const permanent = typeof status === 'number' && [400, 401, 402, 403, 404].includes(status);

    await recordCircuitFailure({
      dependency: 'pierrot_llm',
      errorCode: error instanceof Error ? error.message.slice(0, 120) : 'deepseek_request_failed',
      permanent,
    });

    throw error;
  }
}

async function callOpenRouterDeepSeek(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean = false,
  options: PierrotModelOptions = {}
): Promise<{
  reply: string;
  finishReason: string | null;
  usage: PierrotAttemptUsage | null;
}> {
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  await assertCircuitClosed('openrouter');
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    timeout: providerTimeout(options),
    maxRetries: 0,
    defaultHeaders: {
      'HTTP-Referer': 'https://merkurov.love',
      'X-Title': 'Merkurov Pierrot',
    },
  });

  try {
    const completion = await client.chat.completions.create({
      model: isReasoning ? 'deepseek/deepseek-r1-0528' : 'deepseek/deepseek-chat',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: isReasoning ? undefined : 0.7,
      max_tokens: outputBudget(options),
    });

    const reply = completion.choices[0]?.message?.content;
    if (!reply) {
      throw new Error('OpenRouter returned an empty response.');
    }

    await recordCircuitSuccess('openrouter');
    return {
      reply: reply.trim(),
      finishReason: completion.choices[0]?.finish_reason ?? null,
      usage: usageFrom(completion.usage),
    };
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    const permanent = typeof status === 'number' && [400, 401, 402, 403, 404].includes(status);

    await recordCircuitFailure({
      dependency: 'openrouter',
      errorCode: error instanceof Error ? error.message.slice(0, 120) : 'openrouter_request_failed',
      permanent,
    });

    throw error;
  }
}

async function streamOpenRouterDeepSeek(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  options: PierrotModelOptions = {}
): Promise<{
  reply: string;
  provider: 'openrouter';
  model: string;
  finishReason: string | null;
  usage: PierrotAttemptUsage | null;
}> {
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  await assertCircuitClosed('openrouter');
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    timeout: providerTimeout(options),
    maxRetries: 0,
    defaultHeaders: {
      'HTTP-Referer': 'https://merkurov.love',
      'X-Title': 'Merkurov Pierrot',
    },
  });

  const model = isReasoning ? 'deepseek/deepseek-r1-0528' : 'deepseek/deepseek-chat';
  let content = '';
  let finishReason: string | null = null;
  let usage: PierrotAttemptUsage | null = null;

  try {
    const stream = await client.chat.completions.create(
      {
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: isReasoning ? undefined : 0.7,
        max_tokens: outputBudget(options),
        stream: true,
        // OpenAI-compatible providers only emit the final usage frame when it
        // is explicitly requested. Without this every streaming call looks
        // free in telemetry.
        stream_options: { include_usage: true },
      },
      { signal }
    );

    for await (const chunk of stream) {
      if (chunk.choices[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }
      if (chunk.usage) usage = usageFrom(chunk.usage);
      const text = chunk.choices[0]?.delta?.content;
      if (!text) continue;
      content += text;
      onDelta(text);
    }

    if (!content.trim()) {
      throw new Error('OpenRouter returned an empty response.');
    }

    await recordCircuitSuccess('openrouter');
    return {
      reply: content.trim(),
      provider: 'openrouter',
      model,
      finishReason,
      usage,
    };
  } catch (error) {
    if (signal?.aborted) throw error;

    const status = (error as { status?: unknown } | null)?.status;
    const permanent = typeof status === 'number' && [400, 401, 402, 403, 404].includes(status);

    await recordCircuitFailure({
      dependency: 'openrouter',
      errorCode: error instanceof Error ? error.message.slice(0, 120) : 'openrouter_request_failed',
      permanent,
    });

    throw error;
  }
}

export type PierrotModelResult = {
  reply: string;
  provider: 'gemini' | 'deepseek' | 'openrouter';
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  finishReason: string | null;
  usage: PierrotAttemptUsage | null;
  /**
   * Every provider contacted for this turn, in order. The last entry is the
   * one that produced the answer. Persisted with the answer so a NULL provider
   * can never be the only provenance left in production history.
   */
  providerChain: LlmProvider[];
  /** One entry per provider attempt, including failed fallbacks. */
  attempts: LlmProviderAttempt[];
};

/** A retry reuses the same provider; a fallback changes provider. */
function isSameProviderRetry(
  previousProvider: LlmProvider | null,
  provider: LlmProvider
): boolean {
  return previousProvider === provider;
}

/**
 * Gemini -> DeepSeek Direct -> OpenRouter DeepSeek.
 *
 * The same system prompt, conversation history, RAG context and output format
 * are passed to every provider. A provider failure never reaches the visitor
 * until every fallback has failed.
 */
export async function callPierrotModel(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean = false,
  options: PierrotModelOptions = {}
): Promise<PierrotModelResult> {
  const startedAt = Date.now();
  const attempts: LlmProviderAttempt[] = [];
  const collectAttempt = (attempt: LlmProviderAttempt) => {
    attempts.push(attempt);
    options.onAttempt?.(attempt);
  };
  let geminiFailed = false;
  let attemptNumber = 0;
  let previousProvider: LlmProvider | null = null;

  if (isGeminiConfigured()) {
    attemptNumber += 1;
    const attemptStartedAt = Date.now();

    try {
      const gemini = await generateGeminiText({
        system: systemPrompt,
        messages: messages.flatMap((message) => {
          if (message.role !== 'user' && message.role !== 'assistant') return [];

          const content =
            typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

          return [
            {
              role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
              content,
            },
          ];
        }),
        temperature: 0.7,
        maxOutputTokens: outputBudget(options),
        timeoutMs: providerTimeout(options),
        // The route records the full multi-provider attempt chain, so the
        // Gemini adapter must not create a duplicate single-provider row.
        telemetry: { skip: true },
      });

      const usage = usageFrom(gemini.usage);
      collectAttempt({
        provider: 'gemini',
        model: gemini.model,
        attempt: attemptNumber,
        isRetry: isSameProviderRetry(previousProvider, 'gemini'),
        fallbackFrom: previousProvider,
        ok: true,
        latencyMs: Date.now() - attemptStartedAt,
        finishReason: gemini.finishReason ?? null,
        errorCode: null,
        usage: toTelemetryUsage(usage),
        promptChars: promptChars(systemPrompt, messages),
        responseChars: gemini.content.length,
      });

      return {
        reply: gemini.content,
        provider: 'gemini',
        model: gemini.model,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: false,
        finishReason: gemini.finishReason ?? null,
        usage,
        attempts,
        providerChain: attempts.map((attempt) => attempt.provider),
      };
    } catch (error) {
      collectAttempt({
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        attempt: attemptNumber,
        isRetry: isSameProviderRetry(previousProvider, 'gemini'),
        fallbackFrom: previousProvider,
        ok: false,
        latencyMs: Date.now() - attemptStartedAt,
        finishReason: null,
        errorCode: errorCodeFrom(error),
        usage: toTelemetryUsage(null),
        promptChars: promptChars(systemPrompt, messages),
        responseChars: 0,
      });
      geminiFailed = true;
      previousProvider = 'gemini';
      console.warn(
        '[Pierrot AI] Gemini unavailable; trying DeepSeek:',
        error instanceof Error ? error.message : 'gemini_request_failed'
      );
    }
  }

  let deepseekError: unknown = null;

  attemptNumber += 1;
  const deepseekStartedAt = Date.now();

  try {
    const deepseek = await callDeepSeek(systemPrompt, messages, isReasoning, options);
    const model = isReasoning ? 'deepseek-reasoner' : 'deepseek-chat';

    collectAttempt({
      provider: 'deepseek',
      model,
      attempt: attemptNumber,
      isRetry: isSameProviderRetry(previousProvider, 'deepseek'),
      fallbackFrom: previousProvider,
      ok: true,
      latencyMs: Date.now() - deepseekStartedAt,
      finishReason: deepseek.finishReason,
      errorCode: null,
      usage: toTelemetryUsage(deepseek.usage),
      promptChars: promptChars(systemPrompt, messages),
      responseChars: deepseek.reply.length,
    });

    return {
      reply: deepseek.reply,
      provider: 'deepseek',
      model,
      latencyMs: Date.now() - startedAt,
      fallbackUsed: geminiFailed,
      finishReason: deepseek.finishReason,
      usage: deepseek.usage,
      attempts,
      providerChain: attempts.map((attempt) => attempt.provider),
    };
  } catch (error) {
    collectAttempt({
      provider: 'deepseek',
      model: isReasoning ? 'deepseek-reasoner' : 'deepseek-chat',
      attempt: attemptNumber,
      isRetry: isSameProviderRetry(previousProvider, 'deepseek'),
      fallbackFrom: previousProvider,
      ok: false,
      latencyMs: Date.now() - deepseekStartedAt,
      finishReason: null,
      errorCode: errorCodeFrom(error),
      usage: toTelemetryUsage(null),
      promptChars: promptChars(systemPrompt, messages),
      responseChars: 0,
    });
    deepseekError = error;
    previousProvider = 'deepseek';
    console.warn(
      '[Pierrot AI] DeepSeek direct unavailable; trying OpenRouter:',
      error instanceof Error ? error.message : 'deepseek_request_failed'
    );
  }

  attemptNumber += 1;
  const openrouterStartedAt = Date.now();

  try {
    const openrouter = await callOpenRouterDeepSeek(systemPrompt, messages, isReasoning, options);
    const model = isReasoning ? 'deepseek/deepseek-r1-0528' : 'deepseek/deepseek-chat';

    collectAttempt({
      provider: 'openrouter',
      model,
      attempt: attemptNumber,
      isRetry: isSameProviderRetry(previousProvider, 'openrouter'),
      fallbackFrom: previousProvider,
      ok: true,
      latencyMs: Date.now() - openrouterStartedAt,
      finishReason: openrouter.finishReason,
      errorCode: null,
      usage: toTelemetryUsage(openrouter.usage),
      promptChars: promptChars(systemPrompt, messages),
      responseChars: openrouter.reply.length,
    });

    return {
      reply: openrouter.reply,
      provider: 'openrouter',
      model,
      latencyMs: Date.now() - startedAt,
      fallbackUsed: true,
      finishReason: openrouter.finishReason,
      usage: openrouter.usage,
      attempts,
      providerChain: attempts.map((attempt) => attempt.provider),
    };
  } catch (error) {
    collectAttempt({
      provider: 'openrouter',
      model: isReasoning ? 'deepseek/deepseek-r1-0528' : 'deepseek/deepseek-chat',
      attempt: attemptNumber,
      isRetry: isSameProviderRetry(previousProvider, 'openrouter'),
      fallbackFrom: previousProvider,
      ok: false,
      latencyMs: Date.now() - openrouterStartedAt,
      finishReason: null,
      errorCode: errorCodeFrom(error),
      usage: toTelemetryUsage(null),
      promptChars: promptChars(systemPrompt, messages),
      responseChars: 0,
    });

    throw deepseekError instanceof Error
      ? deepseekError
      : new Error('All AI providers are unavailable.');
  }
}

/**
 * Explicit provider policy for the isolated personal assistant profile.
 *
 * DeepSeek direct is always attempted first. If it is unavailable, the same
 * DeepSeek model is tried through OpenRouter. Gemini is the final fallback.
 * Every provider receives the exact same system prompt and conversation, so a
 * fallback never changes the persona, the language policy or the safety rules.
 */
export const PERSONAL_ASSISTANT_PROVIDER_ORDER = ['deepseek', 'openrouter', 'gemini'] as const;

export type PersonalAssistantProvider = (typeof PERSONAL_ASSISTANT_PROVIDER_ORDER)[number];

/**
 * DeepSeek-first generation for the personal assistant profile.
 *
 * The public Pierrot pipeline keeps its existing Gemini-first order. This
 * function is used only by the personal_assistant branch.
 */
export async function callPersonalAssistantModel(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  options: PierrotModelOptions = {}
): Promise<PierrotModelResult> {
  const startedAt = Date.now();
  const attempts: LlmProviderAttempt[] = [];
  const collectAttempt = (attempt: LlmProviderAttempt) => {
    attempts.push(attempt);
    options.onAttempt?.(attempt);
  };

  let attemptNumber = 0;
  let previousProvider: LlmProvider | null = null;
  let lastError: unknown = null;

  for (const provider of PERSONAL_ASSISTANT_PROVIDER_ORDER) {
    if (provider === 'gemini' && !isGeminiConfigured()) continue;

    attemptNumber += 1;
    const attemptStartedAt = Date.now();

    if (provider === 'deepseek') {
      try {
        const deepseek = await callDeepSeek(systemPrompt, messages, false, options);
        const model = 'deepseek-chat';

        collectAttempt({
          provider: 'deepseek',
          model,
          attempt: attemptNumber,
          isRetry: isSameProviderRetry(previousProvider, 'deepseek'),
          fallbackFrom: previousProvider,
          ok: true,
          latencyMs: Date.now() - attemptStartedAt,
          finishReason: deepseek.finishReason,
          errorCode: null,
          usage: toTelemetryUsage(deepseek.usage),
          promptChars: promptChars(systemPrompt, messages),
          responseChars: deepseek.reply.length,
        });

        return {
          reply: deepseek.reply,
          provider: 'deepseek',
          model,
          latencyMs: Date.now() - startedAt,
          fallbackUsed: attemptNumber > 1,
          finishReason: deepseek.finishReason,
          usage: deepseek.usage,
          attempts,
          providerChain: attempts.map((attempt) => attempt.provider),
        };
      } catch (error) {
        collectAttempt({
          provider: 'deepseek',
          model: 'deepseek-chat',
          attempt: attemptNumber,
          isRetry: isSameProviderRetry(previousProvider, 'deepseek'),
          fallbackFrom: previousProvider,
          ok: false,
          latencyMs: Date.now() - attemptStartedAt,
          finishReason: null,
          errorCode: errorCodeFrom(error),
          usage: toTelemetryUsage(null),
          promptChars: promptChars(systemPrompt, messages),
          responseChars: 0,
        });
        lastError = error;
        previousProvider = 'deepseek';
        console.warn(
          '[Pierrot AI] Personal assistant DeepSeek direct unavailable; trying OpenRouter'
        );
        continue;
      }
    }

    if (provider === 'openrouter') {
      try {
        const openrouter = await callOpenRouterDeepSeek(systemPrompt, messages, false, options);
        const model = 'deepseek/deepseek-chat';

        collectAttempt({
          provider: 'openrouter',
          model,
          attempt: attemptNumber,
          isRetry: isSameProviderRetry(previousProvider, 'openrouter'),
          fallbackFrom: previousProvider,
          ok: true,
          latencyMs: Date.now() - attemptStartedAt,
          finishReason: openrouter.finishReason,
          errorCode: null,
          usage: toTelemetryUsage(openrouter.usage),
          promptChars: promptChars(systemPrompt, messages),
          responseChars: openrouter.reply.length,
        });

        return {
          reply: openrouter.reply,
          provider: 'openrouter',
          model,
          latencyMs: Date.now() - startedAt,
          fallbackUsed: attemptNumber > 1,
          finishReason: openrouter.finishReason,
          usage: openrouter.usage,
          attempts,
          providerChain: attempts.map((attempt) => attempt.provider),
        };
      } catch (error) {
        collectAttempt({
          provider: 'openrouter',
          model: 'deepseek/deepseek-chat',
          attempt: attemptNumber,
          isRetry: isSameProviderRetry(previousProvider, 'openrouter'),
          fallbackFrom: previousProvider,
          ok: false,
          latencyMs: Date.now() - attemptStartedAt,
          finishReason: null,
          errorCode: errorCodeFrom(error),
          usage: toTelemetryUsage(null),
          promptChars: promptChars(systemPrompt, messages),
          responseChars: 0,
        });
        lastError = error;
        previousProvider = 'openrouter';
        console.warn(
          '[Pierrot AI] Personal assistant OpenRouter unavailable; trying Gemini'
        );
        continue;
      }
    }

    try {
      const gemini = await generateGeminiText({
        system: systemPrompt,
        messages: messages.flatMap((message) => {
          if (message.role !== 'user' && message.role !== 'assistant') return [];

          const content =
            typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

          return [
            {
              role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
              content,
            },
          ];
        }),
        temperature: 0.7,
        maxOutputTokens: outputBudget(options),
        timeoutMs: providerTimeout(options),
        telemetry: { skip: true },
      });

      const usage = usageFrom(gemini.usage);

      collectAttempt({
        provider: 'gemini',
        model: gemini.model,
        attempt: attemptNumber,
        isRetry: isSameProviderRetry(previousProvider, 'gemini'),
        fallbackFrom: previousProvider,
        ok: true,
        latencyMs: Date.now() - attemptStartedAt,
        finishReason: gemini.finishReason ?? null,
        errorCode: null,
        usage: toTelemetryUsage(usage),
        promptChars: promptChars(systemPrompt, messages),
        responseChars: gemini.content.length,
      });

      return {
        reply: gemini.content,
        provider: 'gemini',
        model: gemini.model,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: attemptNumber > 1,
        finishReason: gemini.finishReason ?? null,
        usage,
        attempts,
        providerChain: attempts.map((attempt) => attempt.provider),
      };
    } catch (error) {
      collectAttempt({
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        attempt: attemptNumber,
        isRetry: isSameProviderRetry(previousProvider, 'gemini'),
        fallbackFrom: previousProvider,
        ok: false,
        latencyMs: Date.now() - attemptStartedAt,
        finishReason: null,
        errorCode: errorCodeFrom(error),
        usage: toTelemetryUsage(null),
        promptChars: promptChars(systemPrompt, messages),
        responseChars: 0,
      });
      lastError = error;
      previousProvider = 'gemini';
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All AI providers are unavailable.');
}

/**
 * Streaming version of callPierrotModel with the same provider order.
 *
 * Fallback is allowed only before the first emitted token. Once a provider has
 * emitted text, a failure becomes PierrotStreamInterruptedError and is never
 * followed by a second provider's answer.
 */
export async function streamPierrotModel(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  options: PierrotModelOptions = {}
): Promise<PierrotModelResult> {
  const startedAt = Date.now();
  let emitted = false;
  const emit = (text: string) => {
    if (!text) return;
    emitted = true;
    onDelta(text);
  };

  const attempts: LlmProviderAttempt[] = [];
  const collectAttempt = (attempt: LlmProviderAttempt) => {
    attempts.push(attempt);
    options.onAttempt?.(attempt);
  };

  let geminiFailed = false;
  let attemptNumber = 0;
  let previousProvider: LlmProvider | null = null;

  if (signal?.aborted) throw streamAbortError();

  if (isGeminiConfigured()) {
    attemptNumber += 1;
    const attemptStartedAt = Date.now();

    try {
      const gemini = await streamGeminiText({
        system: systemPrompt,
        messages: messages.flatMap((message) => {
          if (message.role !== 'user' && message.role !== 'assistant') return [];

          const content =
            typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

          return [
            {
              role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
              content,
            },
          ];
        }),
        temperature: 0.7,
        maxOutputTokens: outputBudget(options),
        timeoutMs: providerTimeout(options),
        signal,
        onDelta: emit,
        telemetry: { skip: true },
      });

      const usage = usageFrom(gemini.usage);
      collectAttempt({
        provider: 'gemini',
        model: gemini.model,
        attempt: attemptNumber,
        isRetry: isSameProviderRetry(previousProvider, 'gemini'),
        fallbackFrom: previousProvider,
        ok: true,
        latencyMs: Date.now() - attemptStartedAt,
        finishReason: gemini.finishReason ?? null,
        errorCode: null,
        usage: toTelemetryUsage(usage),
        promptChars: promptChars(systemPrompt, messages),
        responseChars: gemini.content.length,
      });

      return {
        reply: gemini.content,
        provider: 'gemini',
        model: gemini.model,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: false,
        finishReason: gemini.finishReason ?? null,
        usage,
        attempts,
        providerChain: attempts.map((attempt) => attempt.provider),
      };
    } catch (error) {
      collectAttempt({
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        attempt: attemptNumber,
        isRetry: isSameProviderRetry(previousProvider, 'gemini'),
        fallbackFrom: previousProvider,
        ok: false,
        latencyMs: Date.now() - attemptStartedAt,
        finishReason: null,
        errorCode: emitted ? 'stream_interrupted' : errorCodeFrom(error),
        usage: toTelemetryUsage(null),
        promptChars: promptChars(systemPrompt, messages),
        responseChars: 0,
      });
      if (emitted) throw new PierrotStreamInterruptedError('gemini');
      if (signal?.aborted) throw streamAbortError();

      geminiFailed = true;
      previousProvider = 'gemini';
      console.warn(
        '[Pierrot AI] Gemini streaming unavailable; trying DeepSeek:',
        error instanceof Error ? error.message : 'gemini_request_failed'
      );
    }
  }

  let deepseekError: unknown = null;

  attemptNumber += 1;
  const deepseekStartedAt = Date.now();

  try {
    const deepseek = await streamDeepSeek(
      systemPrompt,
      messages,
      isReasoning,
      emit,
      signal,
      options
    );

    collectAttempt({
      provider: 'deepseek',
      model: deepseek.model,
      attempt: attemptNumber,
      isRetry: isSameProviderRetry(previousProvider, 'deepseek'),
      fallbackFrom: previousProvider,
      ok: true,
      latencyMs: Date.now() - deepseekStartedAt,
      finishReason: deepseek.finishReason,
      errorCode: null,
      usage: toTelemetryUsage(deepseek.usage),
      promptChars: promptChars(systemPrompt, messages),
      responseChars: deepseek.reply.length,
    });

    return {
      reply: deepseek.reply,
      provider: 'deepseek',
      model: deepseek.model,
      latencyMs: Date.now() - startedAt,
      fallbackUsed: geminiFailed,
      finishReason: deepseek.finishReason,
      usage: deepseek.usage,
      attempts,
      providerChain: attempts.map((attempt) => attempt.provider),
    };
  } catch (error) {
    collectAttempt({
      provider: 'deepseek',
      model: isReasoning ? 'deepseek-reasoner' : 'deepseek-chat',
      attempt: attemptNumber,
      isRetry: isSameProviderRetry(previousProvider, 'deepseek'),
      fallbackFrom: previousProvider,
      ok: false,
      latencyMs: Date.now() - deepseekStartedAt,
      finishReason: null,
      errorCode: emitted ? 'stream_interrupted' : errorCodeFrom(error),
      usage: toTelemetryUsage(null),
      promptChars: promptChars(systemPrompt, messages),
      responseChars: 0,
    });
    if (emitted) throw new PierrotStreamInterruptedError('deepseek');
    if (signal?.aborted) throw streamAbortError();

    deepseekError = error;
    previousProvider = 'deepseek';
    console.warn(
      '[Pierrot AI] DeepSeek streaming unavailable; trying OpenRouter:',
      error instanceof Error ? error.message : 'deepseek_request_failed'
    );
  }

  if (signal?.aborted) throw streamAbortError();

  attemptNumber += 1;
  const openrouterStartedAt = Date.now();

  try {
    const openrouter = await streamOpenRouterDeepSeek(
      systemPrompt,
      messages,
      isReasoning,
      emit,
      signal,
      options
    );

    collectAttempt({
      provider: 'openrouter',
      model: openrouter.model,
      attempt: attemptNumber,
      isRetry: isSameProviderRetry(previousProvider, 'openrouter'),
      fallbackFrom: previousProvider,
      ok: true,
      latencyMs: Date.now() - openrouterStartedAt,
      finishReason: openrouter.finishReason,
      errorCode: null,
      usage: toTelemetryUsage(openrouter.usage),
      promptChars: promptChars(systemPrompt, messages),
      responseChars: openrouter.reply.length,
    });

    return {
      reply: openrouter.reply,
      provider: 'openrouter',
      model: openrouter.model,
      latencyMs: Date.now() - startedAt,
      fallbackUsed: true,
      finishReason: openrouter.finishReason,
      usage: openrouter.usage,
      attempts,
      providerChain: attempts.map((attempt) => attempt.provider),
    };
  } catch (error) {
    collectAttempt({
      provider: 'openrouter',
      model: isReasoning ? 'deepseek/deepseek-r1-0528' : 'deepseek/deepseek-chat',
      attempt: attemptNumber,
      isRetry: isSameProviderRetry(previousProvider, 'openrouter'),
      fallbackFrom: previousProvider,
      ok: false,
      latencyMs: Date.now() - openrouterStartedAt,
      finishReason: null,
      errorCode: emitted ? 'stream_interrupted' : errorCodeFrom(error),
      usage: toTelemetryUsage(null),
      promptChars: promptChars(systemPrompt, messages),
      responseChars: 0,
    });
    if (emitted) throw new PierrotStreamInterruptedError('openrouter');

    throw deepseekError instanceof Error
      ? deepseekError
      : new Error('All AI providers are unavailable.');
  }
}
