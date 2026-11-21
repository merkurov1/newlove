import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { DEEPSEEK_TARIFF } from '@/lib/infrastructure/catalog';

/**
 * Per-call LLM telemetry.
 *
 * Contract:
 *   - one row per provider attempt, including failed attempts and fallbacks;
 *   - token counts come from the provider response or stay null;
 *   - costs are either provider-reported, estimated from a versioned public
 *     tariff, or explicitly unknown. A missing price never becomes 0;
 *   - no prompt, history, answer, RAG passage or credential is stored here.
 */

export type LlmProvider = 'gemini' | 'deepseek' | 'openrouter' | 'openai' | 'other';

export type LlmSurface =
  | 'pierrot_web'
  | 'pierrot_stream'
  | 'question'
  | 'flow_issue'
  | 'flow_item'
  | 'brain'
  | 'media'
  | 'intake'
  | 'art_engine'
  | 'evaluation'
  | 'unknown';

export type LlmUsageSource = 'provider_reported' | 'partial' | 'unknown';
export type LlmCostSource = 'provider_reported' | 'estimated_from_tariff' | 'unknown';

export type LlmTokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  usageSource: LlmUsageSource;
  /** Cost returned by the provider itself, when the API exposes it (OpenRouter). */
  providerReportedCostUsd: number | null;
};

export const UNKNOWN_USAGE: LlmTokenUsage = {
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  usageSource: 'unknown',
  providerReportedCostUsd: null,
};

export type LlmPrice = {
  /** null means this deployment has no verified price for the model. */
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  cachedInputUsdPerMillion: number | null;
  currency: 'USD';
  source: string;
  version: string;
  checkedAt: string;
};

export type LlmCostEstimate = {
  costUsd: number | null;
  source: LlmCostSource;
  pricingVersion: string | null;
  pricingSource: string | null;
  note: string | null;
};

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function envPrice(name: string): number | null {
  const raw = (process.env[name] || '').trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Gemini is reached through the Generative Language API with an API key. Its
 * tariff is not stored in this repository because the account's model tier and
 * region determine the invoice. Operators may supply verified rates through
 * environment variables; until then cost stays explicit unknown.
 */
export const GEMINI_PRICE: LlmPrice = {
  inputUsdPerMillion: envPrice('GEMINI_INPUT_USD_PER_MILLION'),
  outputUsdPerMillion: envPrice('GEMINI_OUTPUT_USD_PER_MILLION'),
  cachedInputUsdPerMillion: envPrice('GEMINI_CACHED_INPUT_USD_PER_MILLION'),
  currency: 'USD',
  source:
    'Google Cloud Billing / Gemini API usage report. No verified rate is bundled with the repository.',
  version: 'gemini-owner-configured-2026-11-18',
  checkedAt: '2026-11-18T00:00:00.000Z',
};

export const DEEPSEEK_PRICE: LlmPrice = {
  // Peak rates are used for a conservative estimate. Off-peak is cheaper.
  inputUsdPerMillion: DEEPSEEK_TARIFF.peak.cacheMissUsdPerM,
  outputUsdPerMillion: DEEPSEEK_TARIFF.peak.outputUsdPerM,
  cachedInputUsdPerMillion: DEEPSEEK_TARIFF.peak.cacheHitUsdPerM,
  currency: 'USD',
  source: DEEPSEEK_TARIFF.source,
  version: DEEPSEEK_TARIFF.version,
  checkedAt: DEEPSEEK_TARIFF.checkedAt,
};

/**
 * OpenRouter markup depends on the routed upstream provider. Only the cost that
 * OpenRouter reports in `usage.cost` is treated as known.
 */
export const OPENROUTER_PRICE: LlmPrice = {
  inputUsdPerMillion: null,
  outputUsdPerMillion: null,
  cachedInputUsdPerMillion: null,
  currency: 'USD',
  source: 'https://openrouter.ai/docs/use-cases/usage-accounting',
  version: 'openrouter-provider-reported-2026-11-18',
  checkedAt: '2026-11-18T00:00:00.000Z',
};

export const OPENAI_PRICE: LlmPrice = {
  inputUsdPerMillion: null,
  outputUsdPerMillion: null,
  cachedInputUsdPerMillion: null,
  currency: 'USD',
  source: 'https://developers.openai.com/api/docs/pricing',
  version: 'openai-owner-configured-2026-11-18',
  checkedAt: '2026-11-18T00:00:00.000Z',
};

export function priceFor(provider: LlmProvider, model: string): LlmPrice {
  const normalized = model.toLowerCase();

  if (provider === 'deepseek') return DEEPSEEK_PRICE;
  if (provider === 'gemini') {
    // Read at call time so an operator can configure a verified invoice rate
    // without rebuilding the bundle.
    return {
      ...GEMINI_PRICE,
      inputUsdPerMillion: envPrice('GEMINI_INPUT_USD_PER_MILLION'),
      outputUsdPerMillion: envPrice('GEMINI_OUTPUT_USD_PER_MILLION'),
      cachedInputUsdPerMillion: envPrice('GEMINI_CACHED_INPUT_USD_PER_MILLION'),
    };
  }
  if (provider === 'openrouter') {
    if (normalized.includes('deepseek')) {
      // OpenRouter reports the actual charge. The underlying DeepSeek rate is
      // still not the OpenRouter price, so it is used only as a floor/estimate.
      return { ...DEEPSEEK_PRICE, version: `${DEEPSEEK_PRICE.version}+openrouter-markup-unknown` };
    }
    return OPENROUTER_PRICE;
  }
  if (provider === 'openai') return OPENAI_PRICE;
  return { ...OPENROUTER_PRICE, version: 'unknown-provider-2026-11-18' };
}

export function estimateLlmCost(input: {
  provider: LlmProvider;
  model: string;
  usage: LlmTokenUsage;
  /** Cache hit share is usually unknown; DeepSeek estimate then uses the peak cache-miss rate. */
  cachedInputTokens?: number | null;
}): LlmCostEstimate {
  const { provider, model, usage } = input;

  if (usage.providerReportedCostUsd !== null && usage.providerReportedCostUsd >= 0) {
    return {
      costUsd: usage.providerReportedCostUsd,
      source: 'provider_reported',
      pricingVersion: null,
      pricingSource: 'provider response',
      note: null,
    };
  }

  const price = priceFor(provider, model);

  if (price.inputUsdPerMillion === null || price.outputUsdPerMillion === null) {
    return {
      costUsd: null,
      source: 'unknown',
      pricingVersion: price.version,
      pricingSource: price.source,
      note:
        provider === 'gemini'
          ? 'Gemini tariff is not fully configured. Set both GEMINI_INPUT_USD_PER_MILLION and GEMINI_OUTPUT_USD_PER_MILLION from a verified Google Cloud invoice to enable estimates.'
          : 'No verified input and output per-token price is configured for this provider/model.',
    };
  }

  const inputTokens = usage.inputTokens;
  const outputTokens = usage.outputTokens;

  if (inputTokens === null && outputTokens === null) {
    return {
      costUsd: null,
      source: 'unknown',
      pricingVersion: price.version,
      pricingSource: price.source,
      note: 'Provider did not report token usage; cost cannot be estimated.',
    };
  }

  const cached = positiveNumber(input.cachedInputTokens) ?? 0;
  const regularInput = Math.max(0, (inputTokens ?? 0) - cached);
  const inputRate = price.inputUsdPerMillion ?? 0;
  const cachedRate = price.cachedInputUsdPerMillion ?? inputRate;
  const outputRate = price.outputUsdPerMillion ?? 0;

  const cost =
    (regularInput * inputRate) / 1_000_000 +
    (cached * cachedRate) / 1_000_000 +
    ((outputTokens ?? 0) * outputRate) / 1_000_000;

  return {
    costUsd: Number(cost.toFixed(8)),
    source: 'estimated_from_tariff',
    pricingVersion: price.version,
    pricingSource: price.source,
    note:
      inputTokens === null || outputTokens === null
        ? 'Estimate is partial because the provider omitted one side of the token usage.'
        : price.version.includes('openrouter-markup-unknown')
          ? 'Underlying DeepSeek rate only; OpenRouter markup is excluded. Prefer provider-reported cost.'
          : null,
  };
}

export type LlmProviderAttempt = {
  provider: LlmProvider;
  model: string;
  /** 1-based position in the fallback chain. */
  attempt: number;
  /** True when this attempt reuses the same provider/model after a failure. */
  isRetry: boolean;
  /** Provider that failed immediately before this attempt, if any. */
  fallbackFrom: LlmProvider | null;
  ok: boolean;
  /** Null when a legacy/manual row has no measured latency. */
  latencyMs: number | null;
  finishReason: string | null;
  errorCode: string | null;
  usage: LlmTokenUsage;
  promptChars: number | null;
  responseChars: number | null;
};

export type LlmCallContext = {
  requestId: string | null;
  conversationId: string | null;
  sessionId: string | null;
  surface: LlmSurface;
  userId: string | null;
};

/** Supabase service-role client used by the telemetry store. */
export type TelemetryStore = SupabaseClient;

/**
 * Context for embedding calls. `store: null` is an explicit consent denial:
 * the attempt is kept as a redacted log only. Omitting `store` lets the
 * embedding client use its own service-role store.
 */
export type EmbeddingTelemetryContext = Partial<Omit<LlmCallContext, 'surface'>> & {
  surface?: LlmSurface;
  skip?: boolean;
  store?: TelemetryStore | null;
};

/**
 * OpenAI-compatible embedding responses may include `usage.prompt_tokens` and
 * `usage.total_tokens`. There is no completion side, so the usage is `partial`
 * rather than pretending the output token count is zero.
 */
export function embeddingUsageFrom(value: unknown): LlmTokenUsage {
  if (!value || typeof value !== 'object') return { ...UNKNOWN_USAGE };

  const record = value as Record<string, unknown>;
  const read = (key: string): number | null =>
    typeof record[key] === 'number' && Number.isFinite(record[key])
      ? (record[key] as number)
      : null;

  const input = read('prompt_tokens') ?? read('input_tokens');
  const total = read('total_tokens');
  const reportedCost = read('cost') ?? read('total_cost') ?? read('provider_cost');

  return {
    inputTokens: input ?? total,
    outputTokens: null,
    totalTokens: total,
    usageSource: input !== null || total !== null ? 'partial' : 'unknown',
    providerReportedCostUsd: reportedCost,
  };
}

export type LlmCallRecord = LlmCallContext &
  LlmProviderAttempt & {
    occurredAt: string;
    cost: LlmCostEstimate;
  };

export function buildLlmCallRecord(input: {
  context: LlmCallContext;
  attempt: LlmProviderAttempt;
  occurredAt?: string;
}): LlmCallRecord {
  const cost = estimateLlmCost({
    provider: input.attempt.provider,
    model: input.attempt.model,
    usage: input.attempt.usage,
  });

  return {
    ...input.context,
    ...input.attempt,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    cost,
  };
}

function isMissingTelemetryTable(error: { code?: unknown; message?: unknown } | null): boolean {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('pierrot_llm_calls')
  );
}

function bounded(value: string | null, max = 160): string | null {
  if (!value) return null;
  return value.slice(0, max);
}

/**
 * Minimal service-role client for provider adapters that do not have a Pierrot
 * conversation store. Read-only callers pass their own client to the report.
 */
export function createTelemetryStore(): TelemetryStore | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Persist one attempt. Failure is logged as a code only and never breaks the
 * answer path. A deployment without the migration keeps working; the caller can
 * still read the structured server log.
 */
export async function recordLlmCall(
  store: TelemetryStore | null,
  record: LlmCallRecord
): Promise<boolean> {
  if (!store) return false;

  try {
    const { error } = await store.from('pierrot_llm_calls').insert({
      occurred_at: record.occurredAt,
      request_id: bounded(record.requestId),
      conversation_id: bounded(record.conversationId),
      session_id: bounded(record.sessionId),
      user_id: bounded(record.userId),
      surface: record.surface,
      provider: record.provider,
      model: bounded(record.model),
      attempt: record.attempt,
      is_retry: record.isRetry,
      fallback_from: record.fallbackFrom,
      ok: record.ok,
      latency_ms:
        record.latencyMs === null ? null : Math.max(0, Math.trunc(record.latencyMs)),
      finish_reason: bounded(record.finishReason),
      error_code: bounded(record.errorCode),
      prompt_chars: record.promptChars,
      response_chars: record.responseChars,
      input_tokens: record.usage.inputTokens,
      output_tokens: record.usage.outputTokens,
      total_tokens: record.usage.totalTokens,
      usage_source: record.usage.usageSource,
      estimated_cost_usd: record.cost.costUsd,
      cost_source: record.cost.source,
      pricing_version: bounded(record.cost.pricingVersion),
      pricing_source: bounded(record.cost.pricingSource, 240),
      provider_reported_cost_usd: record.usage.providerReportedCostUsd,
    });

    if (error) {
      if (!isMissingTelemetryTable(error)) {
        console.warn('[AI telemetry] insert failed', { code: error.code || 'unknown' });
      }
      return false;
    }

    return true;
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : 'unknown';
    console.warn('[AI telemetry] insert failed', { code });
    return false;
  }
}

/** Redacted single-line log for environments where the table is not migrated yet. */
export function logLlmCall(record: LlmCallRecord): void {
  console.info('[AI telemetry]', {
    surface: record.surface,
    provider: record.provider,
    model: record.model,
    attempt: record.attempt,
    is_retry: record.isRetry,
    ok: record.ok,
    latency_ms: record.latencyMs,
    input_tokens: record.usage.inputTokens,
    output_tokens: record.usage.outputTokens,
    usage_source: record.usage.usageSource,
    estimated_cost_usd: record.cost.costUsd,
    cost_source: record.cost.source,
    error_code: record.errorCode,
  });
}
