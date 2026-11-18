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
  retries: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  unknownUsageCalls: number;
  estimatedCostUsd: number | null;
  estimatedCostCalls: number;
  unknownCostCalls: number;
  providerReportedCostUsd: number | null;
  providerReportedCalls: number;
};

export type LlmTelemetryTotals = Omit<LlmTelemetryRow, 'provider' | 'model' | 'surface'> & {
  messages: number;
};

export type LlmTelemetryReport = {
  generatedAt: string;
  period: LlmTelemetryPeriod;
  available: boolean;
  unavailableReason: string | null;
  rows: LlmTelemetryRow[];
  totals: LlmTelemetryTotals;
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
    messages: 0,
    calls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    retries: 0,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    unknownUsageCalls: 0,
    estimatedCostUsd: null,
    estimatedCostCalls: 0,
    unknownCostCalls: 0,
    providerReportedCostUsd: null,
    providerReportedCalls: 0,
  };
}

export function summarizeLlmCalls(
  records: Array<
    Pick<LlmCallRecord, 'provider' | 'model' | 'surface' | 'ok' | 'isRetry' | 'usage' | 'cost'>
  >,
  messages = 0
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
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        unknownUsageCalls: 0,
        estimatedCostUsd: null,
        estimatedCostCalls: 0,
        unknownCostCalls: 0,
        providerReportedCostUsd: null,
        providerReportedCalls: 0,
      } satisfies LlmTelemetryRow);

    row.calls += 1;
    if (record.ok) row.successfulCalls += 1;
    else row.failedCalls += 1;
    if (record.isRetry) row.retries += 1;

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
      inputTokens: addNullable(accumulator.inputTokens, row.inputTokens),
      outputTokens: addNullable(accumulator.outputTokens, row.outputTokens),
      totalTokens: addNullable(accumulator.totalTokens, row.totalTokens),
      unknownUsageCalls: accumulator.unknownUsageCalls + row.unknownUsageCalls,
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
  return { rows, totals };
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
    latencyMs: numberOrNull(row.latency_ms) ?? 0,
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
  'Gemini cost stays unknown until verified rates or a Google Cloud billing export are configured.',
  'Provider-reported cost appears only when the provider returns it (for example OpenRouter usage.cost).',
  'A turn where transcript consent is denied is not persisted; its attempts remain redacted server logs only.',
];

/**
 * Reads per-call telemetry. The table is service-role only; the admin page is
 * the only consumer. A missing migration returns available:false instead of a
 * fabricated zero-cost report.
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
      unavailableReason: 'telemetry_store_unavailable',
      rows: [],
      totals,
      limitations: [...LIMITATIONS, 'The service-role store is not configured.'],
    };
  }

  let messages = 0;

  const messagesResult = await store
    .from('pierrot_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_name', 'assistant_replied')
    .gte('created_at', filters.from)
    .lte('created_at', filters.to);

  if (!messagesResult.error && typeof messagesResult.count === 'number') {
    messages = messagesResult.count;
  }

  let callsQuery = store
    .from('pierrot_llm_calls')
    .select(
      'occurred_at,surface,provider,model,attempt,is_retry,ok,latency_ms,error_code,input_tokens,output_tokens,total_tokens,usage_source,estimated_cost_usd,cost_source,pricing_version,pricing_source,provider_reported_cost_usd'
    )
    .gte('occurred_at', filters.from)
    .lte('occurred_at', filters.to)
    .order('occurred_at', { ascending: false })
    .limit(50_000);

  if (filters.provider) callsQuery = callsQuery.eq('provider', filters.provider);
  if (filters.surface) callsQuery = callsQuery.eq('surface', filters.surface);

  const callsResult = await callsQuery;

  if (callsResult.error) {
    if (isMissingTelemetryTable(callsResult.error)) {
      return {
        generatedAt: new Date().toISOString(),
        period: { from: filters.from, to: filters.to },
        available: false,
        unavailableReason: 'telemetry_migration_not_applied',
        rows: [],
        totals: { ...totals, messages },
        limitations: [
          ...LIMITATIONS,
          'Apply migrations/2026-11-18_pierrot_llm_call_telemetry.sql to record per-call rows.',
        ],
      };
    }

    throw callsResult.error;
  }

  const records = (Array.isArray(callsResult.data) ? callsResult.data : []).map((row) =>
    dbRowToRecord(row as TelemetryDbRow)
  );
  const summary = summarizeLlmCalls(records, messages);

  return {
    generatedAt: new Date().toISOString(),
    period: { from: filters.from, to: filters.to },
    available: true,
    unavailableReason: null,
    rows: summary.rows,
    totals: summary.totals,
    limitations: LIMITATIONS,
  };
}
