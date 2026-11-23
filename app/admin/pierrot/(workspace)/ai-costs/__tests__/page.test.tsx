/** @jest-environment node */

import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/lib/serverAuth', () => ({
  requireAdmin: jest.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111' })),
  getServerSupabaseClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/ai/telemetryReport', () => ({
  loadLlmTelemetryReport: jest.fn(),
}));

const { loadLlmTelemetryReport } = require('@/lib/ai/telemetryReport') as {
  loadLlmTelemetryReport: jest.Mock;
};
const { default: AiCostsPage } = require('../page') as {
  default: (props: { searchParams?: Record<string, string> }) => Promise<unknown>;
};

function report(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: '2026-11-23T10:00:00.000Z',
    period: { from: '2026-11-16T10:00:00.000Z', to: '2026-11-23T10:00:00.000Z' },
    available: true,
    completeness: 'complete',
    unavailableReason: null,
    rows: [],
    totals: {
      messages: 0,
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
    },
    messagesAvailable: true,
    messagesError: null,
    limitations: [],
    ...overrides,
  };
}

describe('AI costs page message count', () => {
  beforeEach(() => {
    (loadLlmTelemetryReport as unknown as jest.Mock).mockReset();
  });

  it('renders a real zero as zero', async () => {
    (loadLlmTelemetryReport as unknown as jest.Mock).mockResolvedValueOnce(report());

    const html = renderToStaticMarkup(
      (await AiCostsPage({ searchParams: { period: '7' } })) as never
    );

    expect(html).toContain('Messages</p><p class="pw-dash-number">0</p>');
    expect(html).not.toContain('This report is partial.');
  });

  it('renders an unavailable count as unknown and explains the partial report', async () => {
    (loadLlmTelemetryReport as unknown as jest.Mock).mockResolvedValueOnce(
      report({
        completeness: 'partial',
        messagesAvailable: false,
        messagesError: '57014: statement timeout',
        totals: { ...report().totals, messages: null },
        limitations: ['Message counts are unavailable; the total is unknown, not zero.'],
      })
    );

    const html = renderToStaticMarkup(
      (await AiCostsPage({ searchParams: { period: '7' } })) as never
    );

    expect(html).toContain('Messages</p><p class="pw-dash-number">unknown</p>');
    expect(html).toContain('This report is partial.');
    expect(html).toContain('The message total is unknown, not zero.');
    expect(html).not.toContain('Messages</p><p class="pw-dash-number">0</p>');
  });
});
