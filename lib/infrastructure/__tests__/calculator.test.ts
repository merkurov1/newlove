import { describe, expect, it } from '@jest/globals';
import { allocateIncludedQuota, buildCostReport, sumUsageEvents } from '../calculator';
import { scenarioPreset } from '../scenarios';

function lineById(report: ReturnType<typeof buildCostReport>, id: string) {
  const line = report.lines.find((entry) => entry.id === id);
  if (!line) throw new Error(`missing line ${id}`);
  return line;
}

describe('infrastructure calculator', () => {
  it('keeps every cost line attributable to a provider, category, currency and source', () => {
    const report = buildCostReport({ scenario: scenarioPreset('comfortable') });
    expect(report.lines.length).toBeGreaterThan(10);
    for (const line of report.lines) {
      expect(line.provider.length).toBeGreaterThan(0);
      expect(line.category.length).toBeGreaterThan(0);
      expect(['EUR', 'USD', 'CHF', 'GBP']).toContain(line.currency);
      expect(line.billingBasis.length).toBeGreaterThan(0);
      expect(line.source.length).toBeGreaterThan(0);
      expect(Number.isNaN(new Date(line.checkedAt).getTime())).toBe(false);
      expect(['actual', 'provider-reported', 'estimate', 'manual', 'unknown']).toContain(
        line.amountKind
      );
      expect(['high', 'medium', 'low', 'unknown']).toContain(line.confidence);
    }
  });

  it('computes a reproducible comfortable run rate and annual projection', () => {
    const report = buildCostReport({ scenario: scenarioPreset('comfortable') });
    expect(report.summary.complete).toBe(true);
    expect(report.summary.unknownLineCount).toBe(0);
    expect(report.summary.monthlyKnownEur).toBeGreaterThan(140);
    expect(report.summary.monthlyKnownEur).toBeLessThan(260);
    expect(report.summary.annualKnownEur).toBeCloseTo(
      report.summary.recurringMonthlyEur * 12 + report.summary.oneOffEur,
      4
    );
  });

  it('separates actual, estimate and unknown instead of folding unknown into zero', () => {
    const report = buildCostReport({ scenario: scenarioPreset('comfortable') });
    expect(report.summary.actualEur).toBeNull();
    expect(report.summary.estimateEur).not.toBeNull();
    expect(report.summary.unknownEur).toBeNull();

    const withUnknown = scenarioPreset('lean');
    withUnknown.emailPlan = 'free';
    withUnknown.emailCountPerMonth = 10_000;
    const unknownReport = buildCostReport({ scenario: withUnknown });
    expect(unknownReport.summary.complete).toBe(false);
    expect(unknownReport.summary.unknownLineCount).toBe(1);
    expect(unknownReport.summary.unknown[0].provider).toBe('resend');
    expect(unknownReport.summary.monthlyKnownEur).toBeGreaterThan(0);
    expect(unknownReport.summary.monthlyKnownEur).not.toBeNull();
  });

  it('does not charge Supabase egress inside the shared included quota', () => {
    const report = buildCostReport({ scenario: scenarioPreset('comfortable') });
    const egress = lineById(report, 'supabase-egress');
    const mediaEgress = lineById(report, 'supabase-media-egress');
    expect(egress.overageQuantity).toBe(0);
    expect(mediaEgress.overageQuantity).toBe(0);
    expect(egress.nativeAmount).toBe(0);
    expect(mediaEgress.nativeAmount).toBe(0);
  });

  it('charges only the overage above a shared quota', () => {
    const allocation = allocateIncludedQuota(
      [
        { id: 'production', quantity: 300 },
        { id: 'media', quantity: 200 },
      ],
      250
    );
    expect(allocation[0].includedShare).toBeCloseTo(150, 6);
    expect(allocation[1].includedShare).toBeCloseTo(100, 6);
    expect(allocation[0].overage).toBeCloseTo(150, 6);
    expect(allocation[1].overage).toBeCloseTo(100, 6);
  });

  it('applies the Pro compute credit and Codespaces included core-hours', () => {
    const micro = scenarioPreset('comfortable');
    micro.supabaseCompute = 'micro';
    expect(lineById(buildCostReport({ scenario: micro }), 'supabase-compute').nativeAmount).toBe(0);

    const small = scenarioPreset('comfortable');
    small.supabaseCompute = 'small';
    expect(lineById(buildCostReport({ scenario: small }), 'supabase-compute').nativeAmount).toBe(5);

    const codespaces = lineById(
      buildCostReport({ scenario: scenarioPreset('comfortable') }),
      'github-codespaces-compute'
    );
    // 80 hours × 4 cores = 320 core-hours; 180 included.
    expect(codespaces.overageQuantity).toBe(140);
    expect(codespaces.nativeAmount).toBeCloseTo(12.6, 6);
  });

  it('deduplicates retried usage events before charging', () => {
    const deduped = sumUsageEvents([
      { id: 'evt-1', provider: 'deepseek', metric: 'input_tokens', quantity: 1_000 },
      { id: 'evt-1', provider: 'deepseek', metric: 'input_tokens', quantity: 1_000 },
      { id: 'evt-2', provider: 'deepseek', metric: 'input_tokens', quantity: 500 },
      { id: 'bad', provider: 'deepseek', metric: 'input_tokens', quantity: -1 },
    ]);
    expect(deduped.total).toBe(1_500);
    expect(deduped.duplicates).toBe(1);
    expect(deduped.invalid).toBe(1);

    const report = buildCostReport({
      scenario: scenarioPreset('comfortable'),
      usageEvents: [
        { id: 'evt-1', provider: 'deepseek', metric: 'input_tokens', quantity: 1_000 },
        { id: 'evt-1', provider: 'deepseek', metric: 'input_tokens', quantity: 1_000 },
      ],
    });
    expect(lineById(report, 'ai-input').usageQuantity).toBe(1_000);
  });

  it('converts native currencies with the versioned ECB rate', () => {
    const report = buildCostReport({ scenario: scenarioPreset('comfortable') });
    const usd = report.fx.find((rate) => rate.currency === 'USD');
    const chf = report.fx.find((rate) => rate.currency === 'CHF');
    expect(usd?.eurPerUnit).toBeCloseTo(1 / 1.0989, 8);
    expect(chf?.eurPerUnit).toBeCloseTo(1 / 0.9233, 8);
    const plan = lineById(report, 'vercel-plan');
    expect(plan.eurAmount).toBeCloseTo(20 / 1.0989, 5);
  });

  it('marks an over-budget complete scenario as over, not as a silent estimate', () => {
    const scenario = scenarioPreset('comfortable');
    scenario.budgetEur = 1;
    const report = buildCostReport({ scenario });
    expect(report.summary.complete).toBe(true);
    expect(report.budget.status).toBe('over');
  });

  it('keeps fixed and variable plus allocation totals consistent with the known total', () => {
    const report = buildCostReport({ scenario: scenarioPreset('intensive') });
    expect(report.summary.fixedEur + report.summary.variableEur).toBeCloseTo(
      report.summary.recurringMonthlyEur,
      4
    );
    const allocationTotal =
      report.summary.byAllocation.production +
      report.summary.byAllocation.development +
      report.summary.byAllocation.media;
    expect(allocationTotal).toBeCloseTo(report.summary.monthlyKnownEur, 4);
  });
});
