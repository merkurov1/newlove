import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

assertServerOnly('lib/ai/telemetryReport');

import type { LlmCallRecord, LlmCostSource, LlmProvider, LlmSurface } from './telemetry';

export type LlmTelemetryPeriod = {
  from: string;
  to: string;
};

export type LlmTelemetryFilters = LlmTelemetryPeriod & {
  provider?: LlmProvider | null;
  surface?: LlmSurface | null;
};

export type LlmTelemetryRow = {
  provider: string;
  model: string;
  surface: string;
  calls: number;
  successfulCalls: number;
  failedCalls: number;
  /** Attempts that repeated the same provider after a failure. */
  retries: number;
  /** Attempts that switched to another provider after a failure. */
  fallbacks: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  unknownUsageCalls: number;
  latencyTotalMs: number;
  latencySamples: number;
  averageLatencyMs: number | null;
  estimatedCostUsd: number | null;
  estimatedCostCalls: number;
  unknownCostCalls: number;
  providerReportedCostUsd: number | null;
  providerReportedCalls: number;
};

export type LlmTelemetryTotals = Omit<LlmTelemetryRow, 'provider' | 'model' | 'surface'> & {
  /**
   * assistant_replied events. null means the source could not be counted and
   * must never be rendered as zero. A real zero stays 0.
   */
  messages: number | null;
};

export type LlmTelemetryCompleteness = 'complete' | 'partial' | 'unavailable';

export type LlmTelemetryReport = {
  generatedAt: string;
  period: LlmTelemetryPeriod;
  /** True when the per-call telemetry source was read successfully. */
  available: boolean;
  /** Whole-report health: some source failed (partial) or calls failed (unavailable). */
  completeness: LlmTelemetryCompleteness;
  unavailableReason: string | null;
  rows: LlmTelemetryRow[];
  totals: LlmTelemetryTotals;
  /** False when the pierrot_events count failed; totals.messages is then null. */
  messagesAvailable: boolean;
  /** Stable error summary for the messages source, or null on success. */
  messagesError: string | null;
  limitations: string[];
};

type TelemetryDbRow = Record<string, unknown>;

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function addNullable(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return left + right;
}

function emptyTotals(): LlmTelemetryTotals {
  return {
    messages: null,
    calls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    retries: 0,
    fallbacks: 0,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    unknownUsageCalls: 0,
    latencyTotalMs: 0,
    latencySamples: 0,
    averageLatencyMs: null,
    estimatedCostUsd: null,
    estimatedCostCalls: 0,
    unknownCostCalls: 0,
    providerReportedCostUsd: null,
    providerReportedCalls: 0,
  };
}

export function summarizeLlmCalls(
  records: Array<
    Pick<
      LlmCallRecord,
      | 'provider'
      | 'model'
      | 'surface'
      | 'ok'
      | 'isRetry'
      | 'fallbackFrom'
      | 'latencyMs'
      | 'usage'
      | 'cost'
    >
  >,
  messages: number | null = null
): { rows: LlmTelemetryRow[]; totals: LlmTelemetryTotals } {
  const grouped = new Map<string, LlmTelemetryRow>();

  for (const record of records) {
    const key = `${record.provider}\u0000${record.model}\u0000${record.surface}`;
    const row =
      grouped.get(key) ??
      ({
        provider: record.provider,
        model: record.model,
        surface: record.surface,
        calls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        retries: 0,
        fallbacks: 0,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        unknownUsageCalls: 0,
        latencyTotalMs: 0,
        latencySamples: 0,
        averageLatencyMs: null,
        estimatedCostUsd: null,
        estimatedCostCalls: 0,
        unknownCostCalls: 0,
        providerReportedCostUsd: null,
        providerReportedCalls: 0,
      } satisfies LlmTelemetryRow);

    row.calls += 1;
    if (record.ok) row.successfulCalls += 1;
    else row.failedCalls += 1;
    // Retry and fallback are separate events: a retry repeats the same
    // provider, a fallback switches provider. Older rows may have set
    // is_retry on a fallback, so fallback_from wins when both are present.
    if (record.fallbackFrom) row.fallbacks += 1;
    else if (record.isRetry) row.retries += 1;

    const latency =
      typeof record.latencyMs === 'number' &&
      Number.isFinite(record.latencyMs) &&
      record.latencyMs >= 0
        ? record.latencyMs
        : null;
    if (latency !== null) {
      row.latencyTotalMs += latency;
      row.latencySamples += 1;
    }

    if (record.usage.usageSource === 'unknown') {
      row.unknownUsageCalls += 1;
    } else {
      row.inputTokens = addNullable(row.inputTokens, record.usage.inputTokens);
      row.outputTokens = addNullable(row.outputTokens, record.usage.outputTokens);
      row.totalTokens = addNullable(row.totalTokens, record.usage.totalTokens);
    }

    const costSource: LlmCostSource = record.cost.source;
    if (costSource === 'provider_reported') {
      row.providerReportedCalls += 1;
      row.providerReportedCostUsd = addNullable(row.providerReportedCostUsd, record.cost.costUsd);
    } else if (costSource === 'estimated_from_tariff') {
      row.estimatedCostCalls += 1;
      row.estimatedCostUsd = addNullable(row.estimatedCostUsd, record.cost.costUsd);
    } else {
      row.unknownCostCalls += 1;
    }

    grouped.set(key, row);
  }

  for (const row of grouped.values()) {
    row.averageLatencyMs =
      row.latencySamples > 0 ? Math.round(row.latencyTotalMs / row.latencySamples) : null;
  }

  const rows = [...grouped.values()].sort(
    (left, right) =>
      right.calls - left.calls ||
      left.provider.localeCompare(right.provider) ||
      left.model.localeCompare(right.model)
  );

  const totals = rows.reduce<LlmTelemetryTotals>(
    (accumulator, row) => ({
      messages: accumulator.messages,
      calls: accumulator.calls + row.calls,
      successfulCalls: accumulator.successfulCalls + row.successfulCalls,
      failedCalls: accumulator.failedCalls + row.failedCalls,
      retries: accumulator.retries + row.retries,
      fallbacks: accumulator.fallbacks + row.fallbacks,
      inputTokens: addNullable(accumulator.inputTokens, row.inputTokens),
      outputTokens: addNullable(accumulator.outputTokens, row.outputTokens),
      totalTokens: addNullable(accumulator.totalTokens, row.totalTokens),
      unknownUsageCalls: accumulator.unknownUsageCalls + row.unknownUsageCalls,
      latencyTotalMs: accumulator.latencyTotalMs + row.latencyTotalMs,
      latencySamples: accumulator.latencySamples + row.latencySamples,
      averageLatencyMs: null,
      estimatedCostUsd: addNullable(accumulator.estimatedCostUsd, row.estimatedCostUsd),
      estimatedCostCalls: accumulator.estimatedCostCalls + row.estimatedCostCalls,
      unknownCostCalls: accumulator.unknownCostCalls + row.unknownCostCalls,
      providerReportedCostUsd: addNullable(
        accumulator.providerReportedCostUsd,
        row.providerReportedCostUsd
      ),
      providerReportedCalls: accumulator.providerReportedCalls + row.providerReportedCalls,
    }),
    emptyTotals()
  );

  totals.messages = messages;
  totals.averageLatencyMs =
    totals.latencySamples > 0 ? Math.round(totals.latencyTotalMs / totals.latencySamples) : null;
  return { rows, totals };
}

function isMissingTelemetryTable(error: unknown): boolean {
  const record =
    error && typeof error === 'object'
      ? (error as { code?: unknown; message?: unknown })
      : ({} as { code?: unknown; message?: unknown });
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('pierrot_llm_calls')
  );
}

function describeSourceError(error: unknown): string {
  if (!error) return 'unknown_error';
  if (typeof error === 'string') {
    return error.replace(/\s+/g, ' ').trim().slice(0, 240) || 'unknown_error';
  }
  if (typeof error !== 'object') return 'unknown_error';

  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === 'string' ? record.code.trim() : '';
  const message =
    typeof record.message === 'string'
      ? record.message.replace(/\s+/g, ' ').trim().slice(0, 200)
      : '';
  const summary = [code, message].filter(Boolean).join(': ');
  return summary || 'unknown_error';
}

function messagesLimitation(error: string): string {
  return `Message counts are unavailable because the pierrot_events count failed (${error}). The message total is unknown, not zero.`;
}

function dbRowToRecord(row: TelemetryDbRow): LlmCallRecord {
  const usageSource =
    row.usage_source === 'provider_reported' || row.usage_source === 'partial'
      ? row.usage_source
      : 'unknown';
  const costSource =
    row.cost_source === 'provider_reported' || row.cost_source === 'estimated_from_tariff'
      ? row.cost_source
      : 'unknown';

  return {
    occurredAt: text(row.occurred_at, new Date(0).toISOString()),
    requestId: typeof row.request_id === 'string' ? row.request_id : null,
    conversationId: typeof row.conversation_id === 'string' ? row.conversation_id : null,
    sessionId: typeof row.session_id === 'string' ? row.session_id : null,
    userId: typeof row.user_id === 'string' ? row.user_id : null,
    surface: text(row.surface, 'unknown') as LlmSurface,
    provider: text(row.provider, 'other') as LlmProvider,
    model: text(row.model, 'unknown'),
    attempt: numberOrNull(row.attempt) ?? 1,
    isRetry: row.is_retry === true,
    fallbackFrom: typeof row.fallback_from === 'string' ? (row.fallback_from as LlmProvider) : null,
    ok: row.ok === true,
    latencyMs: numberOrNull(row.latency_ms),
    finishReason: typeof row.finish_reason === 'string' ? row.finish_reason : null,
    errorCode: typeof row.error_code === 'string' ? row.error_code : null,
    usage: {
      inputTokens: numberOrNull(row.input_tokens),
      outputTokens: numberOrNull(row.output_tokens),
      totalTokens: numberOrNull(row.total_tokens),
      usageSource,
      providerReportedCostUsd: numberOrNull(row.provider_reported_cost_usd),
    },
    promptChars: numberOrNull(row.prompt_chars),
    responseChars: numberOrNull(row.response_chars),
    cost: {
      costUsd: numberOrNull(row.estimated_cost_usd),
      source: costSource,
      pricingVersion: typeof row.pricing_version === 'string' ? row.pricing_version : null,
      pricingSource: typeof row.pricing_source === 'string' ? row.pricing_source : null,
      note: null,
    },
  };
}

const LIMITATIONS = [
  'Calls are provider attempts, not user messages. A fallback adds another row.',
  'Estimated costs use versioned public tariffs and peak rates. They are not an invoice.',
  'Embedding requests appear as openrouter attempts with finish_reason=embedding; their vectors are never stored.',
  'Gemini cost stays unknown until verified rates or a Google Cloud billing export are configured.',
  'Provider-reported cost appears only when the provider returns it (for example OpenRouter usage.cost).',
  'A turn where transcript consent is denied is not persisted; its attempts remain redacted server logs only.',
];

/**
 * Reads per-call telemetry. The table is service-role only; the admin page is
 * the only consumer. A missing migration returns available:false instead of a
 * fabricated zero-cost report. A failed pierrot_events count leaves messages
 * unknown (null) and marks the report partial; it never becomes zero.
 */
export async function loadLlmTelemetryReport(
  store: SupabaseClient | null,
  filters: LlmTelemetryFilters
): Promise<LlmTelemetryReport> {
  const totals = emptyTotals();

  if (!store) {
    return {
      generatedAt: new Date().toISOString(),
      period: { from: filters.from, to: filters.to },
      available: false,
      completeness: 'unavailable',
      unavailableReason: 'telemetry_store_unavailable',
      rows: [],
      totals,
      messagesAvailable: false,
      messagesError: 'telemetry_store_unavailable',
      limitations: [...LIMITATIONS, 'The service-role store is not configured.'],
    };
  }

  let messages: number | null = null;
  let messagesError: string | null = null;

  try {
    const messagesResult = await store
      .from('pierrot_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', 'assistant_replied')
      .gte('created_at', filters.from)
      .lte('created_at', filters.to);

    if (messagesResult.error) {
      messagesError = describeSourceError(messagesResult.error);
    } else if (
      typeof messagesResult.count === 'number' &&
      Number.isFinite(messagesResult.count) &&
      messagesResult.count >= 0
    ) {
      // A real zero is a valid count and must stay zero.
      messages = messagesResult.count;
    } else {
      // PostgREST can return no count without an explicit error. That is still
      // unknown, not an empty period.
      messagesError = 'count_missing';
    }
  } catch (error) {
    messagesError = describeSourceError(error);
  }

  const messagesAvailable = messages !== null;

  let callsQuery = store
    .from('pierrot_llm_calls')
    .select(
      'occurred_at,surface,provider,model,attempt,is_retry,fallback_from,ok,latency_ms,error_code,input_tokens,output_tokens,total_tokens,usage_source,estimated_cost_usd,cost_source,pricing_version,pricing_source,provider_reported_cost_usd'
    )
    .gte('occurred_at', filters.from)
    .lte('occurred_at', filters.to)
    .order('occurred_at', { ascending: false })
    .limit(50_000);

  if (filters.provider) callsQuery = callsQuery.eq('provider', filters.provider);
  if (filters.surface) callsQuery = callsQuery.eq('surface', filters.surface);

  let callsError: unknown = null;
  let callsData: unknown = null;

  try {
    const callsResult = await callsQuery;
    callsError = callsResult.error;
    callsData = callsResult.data;
  } catch (error) {
    callsError = error;
  }

  const baseLimitations = [...LIMITATIONS];
  if (!messagesAvailable) {
    baseLimitations.push(messagesLimitation(messagesError ?? 'unknown_error'));
  }

  if (callsError || !Array.isArray(callsData)) {
    const missingTable = isMissingTelemetryTable(callsError);
    const callsErrorSummary = callsError ? describeSourceError(callsError) : 'calls_data_missing';

    return {
      generatedAt: new Date().toISOString(),
      period: { from: filters.from, to: filters.to },
      available: false,
      completeness: 'unavailable',
      unavailableReason: missingTable ? 'telemetry_migration_not_applied' : 'telemetry_read_failed',
      rows: [],
      totals: { ...totals, messages },
      messagesAvailable,
      messagesError,
      limitations: missingTable
        ? [
            ...baseLimitations,
            'Apply migrations/2026-11-18_pierrot_llm_call_telemetry.sql to record per-call rows.',
          ]
        : [...baseLimitations, `Per-call telemetry could not be read (${callsErrorSummary}).`],
    };
  }

  const records = callsData.map((row) => dbRowToRecord(row as TelemetryDbRow));
  const summary = summarizeLlmCalls(records, messages);

  return {
    generatedAt: new Date().toISOString(),
    period: { from: filters.from, to: filters.to },
    available: true,
    completeness: messagesAvailable ? 'complete' : 'partial',
    unavailableReason: null,
    rows: summary.rows,
    totals: summary.totals,
    messagesAvailable,
    messagesError,
    limitations: baseLimitations,
  };
}
