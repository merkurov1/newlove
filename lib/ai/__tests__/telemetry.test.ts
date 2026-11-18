/** @jest-environment node */

import {
  buildLlmCallRecord,
  estimateLlmCost,
  recordLlmCall,
  type LlmProviderAttempt,
} from '../telemetry';
import { summarizeLlmCalls } from '../telemetryReport';

function attempt(overrides: Partial<LlmProviderAttempt> = {}): LlmProviderAttempt {
  return {
    provider: 'deepseek',
    model: 'deepseek-chat',
    attempt: 1,
    isRetry: false,
    fallbackFrom: null,
    ok: true,
    latencyMs: 100,
    finishReason: 'stop',
    errorCode: null,
    usage: {
      inputTokens: 1_000,
      outputTokens: 500,
      totalTokens: 1_500,
      usageSource: 'provider_reported',
      providerReportedCostUsd: null,
    },
    promptChars: 2_000,
    responseChars: 400,
    ...overrides,
  };
}

describe('LLM cost telemetry', () => {
  it('estimates DeepSeek from the versioned public tariff', () => {
    const cost = estimateLlmCost({
      provider: 'deepseek',
      model: 'deepseek-chat',
      usage: attempt().usage,
    });

    // 1k input * $0.30/M + 0.5k output * $1.20/M = 0.0003 + 0.0006
    expect(cost.source).toBe('estimated_from_tariff');
    expect(cost.costUsd).toBeCloseTo(0.0009, 8);
    expect(cost.pricingVersion).toContain('deepseek');
    expect(cost.pricingSource).toContain('deepseek');
  });

  it('keeps Gemini cost explicit unknown until verified rates are configured', () => {
    const cost = estimateLlmCost({
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      usage: attempt({ provider: 'gemini', model: 'gemini-3.5-flash' }).usage,
    });

    expect(cost.costUsd).toBeNull();
    expect(cost.source).toBe('unknown');
    expect(cost.note).toContain('GEMINI_INPUT_USD_PER_MILLION');
  });

  it('never turns missing tokens into a zero cost', () => {
    const cost = estimateLlmCost({
      provider: 'deepseek',
      model: 'deepseek-chat',
      usage: attempt({
        usage: {
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          usageSource: 'unknown',
          providerReportedCostUsd: null,
        },
      }).usage,
    });

    expect(cost.costUsd).toBeNull();
    expect(cost.source).toBe('unknown');
  });

  it('prefers a provider-reported cost over a tariff estimate', () => {
    const cost = estimateLlmCost({
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      usage: {
        inputTokens: 1_000,
        outputTokens: 500,
        totalTokens: 1_500,
        usageSource: 'provider_reported',
        providerReportedCostUsd: 0.00123,
      },
    });

    expect(cost.source).toBe('provider_reported');
    expect(cost.costUsd).toBe(0.00123);
  });

  it('builds one record per attempt without any prompt or answer text', () => {
    const record = buildLlmCallRecord({
      context: {
        requestId: 'req-1',
        conversationId: 'conv-1',
        sessionId: 'sess-1',
        userId: 'user-1',
        surface: 'pierrot_stream',
      },
      attempt: attempt(),
      occurredAt: '2026-11-18T10:00:00.000Z',
    });

    const serialized = JSON.stringify(record);
    expect(record.attempt).toBe(1);
    expect(record.promptChars).toBe(2_000);
    expect(record.responseChars).toBe(400);
    expect(serialized).not.toContain('what the user asked');
    expect(serialized).not.toContain('model answer text');
  });

  it('inserts telemetry through the service store and tolerates a missing table', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const store = {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: null };
        },
      }),
    } as never;

    const record = buildLlmCallRecord({
      context: {
        requestId: 'req-1',
        conversationId: null,
        sessionId: null,
        userId: null,
        surface: 'pierrot_web',
      },
      attempt: attempt(),
    });

    await expect(recordLlmCall(store, record)).resolves.toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-chat',
      attempt: 1,
      input_tokens: 1_000,
      output_tokens: 500,
      usage_source: 'provider_reported',
      cost_source: 'estimated_from_tariff',
    });

    const unavailable = {
      from: () => ({
        insert: async () => ({ error: { code: '42P01', message: 'relation does not exist' } }),
      }),
    } as never;

    await expect(recordLlmCall(unavailable, record)).resolves.toBe(false);
  });
});

describe('LLM telemetry report', () => {
  it('separates calls, messages, retries, tokens, estimates and provider costs', () => {
    const first = buildLlmCallRecord({
      context: {
        requestId: 'req-1',
        conversationId: 'conv-1',
        sessionId: 'sess-1',
        userId: null,
        surface: 'pierrot_web',
      },
      attempt: attempt({ attempt: 1, isRetry: false }),
      occurredAt: '2026-11-18T10:00:00.000Z',
    });
    const fallback = buildLlmCallRecord({
      context: {
        requestId: 'req-1',
        conversationId: 'conv-1',
        sessionId: 'sess-1',
        userId: null,
        surface: 'pierrot_web',
      },
      attempt: attempt({
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        attempt: 2,
        isRetry: true,
        fallbackFrom: 'deepseek',
        ok: false,
        usage: {
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          usageSource: 'unknown',
          providerReportedCostUsd: null,
        },
      }),
      occurredAt: '2026-11-18T10:00:01.000Z',
    });
    const reported = buildLlmCallRecord({
      context: {
        requestId: 'req-2',
        conversationId: 'conv-2',
        sessionId: 'sess-2',
        userId: null,
        surface: 'pierrot_stream',
      },
      attempt: attempt({
        provider: 'openrouter',
        model: 'deepseek/deepseek-chat',
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          usageSource: 'provider_reported',
          providerReportedCostUsd: 0.0002,
        },
      }),
      occurredAt: '2026-11-18T10:00:02.000Z',
    });

    const { rows, totals } = summarizeLlmCalls([first, fallback, reported], 1);

    expect(totals.messages).toBe(1);
    expect(totals.calls).toBe(3);
    expect(totals.retries).toBe(1);
    expect(totals.failedCalls).toBe(1);
    expect(totals.unknownUsageCalls).toBe(1);
    expect(totals.unknownCostCalls).toBe(1);
    expect(totals.estimatedCostCalls).toBe(1);
    expect(totals.providerReportedCalls).toBe(1);
    expect(totals.estimatedCostUsd).toBeCloseTo(0.0009, 8);
    expect(totals.providerReportedCostUsd).toBeCloseTo(0.0002, 8);
    expect(rows).toHaveLength(3);
    expect(rows.some((row) => row.provider === 'gemini' && row.unknownCostCalls === 1)).toBe(true);
  });

  it('does not duplicate a user-visible message when one turn has two attempts', () => {
    const first = buildLlmCallRecord({
      context: {
        requestId: 'req-1',
        conversationId: 'conv-1',
        sessionId: 'sess-1',
        userId: null,
        surface: 'pierrot_web',
      },
      attempt: attempt({ attempt: 1, isRetry: false, ok: false }),
    });
    const second = buildLlmCallRecord({
      context: {
        requestId: 'req-1',
        conversationId: 'conv-1',
        sessionId: 'sess-1',
        userId: null,
        surface: 'pierrot_web',
      },
      attempt: attempt({
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        attempt: 2,
        isRetry: true,
        fallbackFrom: 'deepseek',
        ok: true,
      }),
    });

    const { totals } = summarizeLlmCalls([first, second], 1);

    expect(totals.calls).toBe(2);
    expect(totals.retries).toBe(1);
    expect(totals.messages).toBe(1);
  });
});
