/** @jest-environment node */

import { loadLlmTelemetryReport } from '../telemetryReport';

function thenable(value: unknown) {
  const proxy: Record<string, unknown> = {};
  const chain = new Proxy(proxy, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve: (value: unknown) => void) => resolve(value);
      }
      return () => chain;
    },
  });
  return chain;
}

function store(input: {
  eventsCount?: number;
  calls?: {
    data: Array<Record<string, unknown>> | null;
    error: { code?: string; message?: string } | null;
  };
  select?: string;
}) {
  return {
    from(table: string) {
      if (table === 'pierrot_events') {
        return thenable({ count: input.eventsCount ?? 0, error: null });
      }
      return {
        select(columns: string) {
          if (input.select !== undefined) input.select = columns;
          const query = input.calls ?? { data: [], error: null };
          return thenable(query);
        },
      };
    },
  } as never;
}

describe('admin LLM telemetry report', () => {
  it('keeps null usage unknown and exposes fallbacks, retries and latency separately', async () => {
    const calls = [
      {
        occurred_at: '2026-11-21T10:00:00.000Z',
        surface: 'pierrot_web',
        provider: 'deepseek',
        model: 'deepseek-chat',
        attempt: 1,
        is_retry: false,
        fallback_from: 'gemini',
        ok: true,
        latency_ms: 200,
        error_code: null,
        input_tokens: 100,
        output_tokens: null,
        total_tokens: null,
        usage_source: 'partial',
        estimated_cost_usd: 0.00003,
        cost_source: 'estimated_from_tariff',
        pricing_version: 'deepseek-2026-11-18',
        pricing_source: 'deepseek public tariff',
        provider_reported_cost_usd: null,
      },
      {
        occurred_at: '2026-11-21T10:00:01.000Z',
        surface: 'pierrot_web',
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        attempt: 1,
        is_retry: false,
        fallback_from: null,
        ok: false,
        latency_ms: null,
        error_code: 'gemini_http_429',
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        usage_source: 'unknown',
        estimated_cost_usd: null,
        cost_source: 'unknown',
        pricing_version: 'gemini-owner-configured-2026-11-18',
        pricing_source: 'Google Cloud Billing',
        provider_reported_cost_usd: null,
      },
    ];

    const report = await loadLlmTelemetryReport(
      store({ eventsCount: 1, calls: { data: calls, error: null } }),
      {
        from: '2026-11-20T00:00:00.000Z',
        to: '2026-11-22T00:00:00.000Z',
      }
    );

    expect(report.available).toBe(true);
    expect(report.totals.messages).toBe(1);
    expect(report.totals.calls).toBe(2);
    expect(report.totals.failedCalls).toBe(1);
    expect(report.totals.fallbacks).toBe(1);
    expect(report.totals.retries).toBe(0);
    expect(report.totals.averageLatencyMs).toBe(200);
    expect(report.totals.latencySamples).toBe(1);
    expect(report.totals.inputTokens).toBe(100);
    expect(report.totals.outputTokens).toBeNull();
    expect(report.totals.totalTokens).toBeNull();
    expect(report.totals.unknownUsageCalls).toBe(1);
    expect(report.totals.estimatedCostUsd).toBeCloseTo(0.00003, 8);
    expect(report.totals.unknownCostCalls).toBe(1);

    const gemini = report.rows.find((row) => row.provider === 'gemini');
    expect(gemini?.averageLatencyMs).toBeNull();
    expect(gemini?.estimatedCostUsd).toBeNull();
    expect(gemini?.unknownCostCalls).toBe(1);
  });

  it('reports a missing migration instead of fabricating an empty zero-cost report', async () => {
    const report = await loadLlmTelemetryReport(
      store({
        eventsCount: 3,
        calls: {
          data: null,
          error: { code: '42P01', message: 'relation public.pierrot_llm_calls does not exist' },
        },
      }),
      {
        from: '2026-11-20T00:00:00.000Z',
        to: '2026-11-22T00:00:00.000Z',
      }
    );

    expect(report.available).toBe(false);
    expect(report.unavailableReason).toBe('telemetry_migration_not_applied');
    expect(report.rows).toEqual([]);
    expect(report.totals.messages).toBe(3);
    expect(report.totals.estimatedCostUsd).toBeNull();
  });
});
