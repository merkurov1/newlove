import { describe, expect, it } from '@jest/globals';
import type { CommercialSummary } from '@/lib/pierrot/commercialSummary';
import { emptyCommercialSummary } from '@/lib/pierrot/commercialSummary';
import { buildDevLedgerBridge, buildSelfFunding } from '../selfFunding';
import { buildCostReport } from '../calculator';
import { scenarioPreset } from '../scenarios';

function summary(overrides: {
  currentMoney?: Array<{ currency: string; amountMinor: number; count: number }>;
  previousMoney?: Array<{ currency: string; amountMinor: number; count: number }>;
  complete?: boolean;
  purchasesAvailable?: boolean;
  donationsAvailable?: boolean;
  subscriptionsAvailable?: boolean;
  flowSubscriptions?: number;
}): CommercialSummary {
  const base = emptyCommercialSummary('last_30_days', new Date('2026-11-18T00:00:00.000Z'));
  return {
    ...base,
    complete: overrides.complete ?? true,
    errors: overrides.complete === false ? ['pierrot_v_purchases:unavailable'] : [],
    current: {
      ...base.current,
      paidCount: overrides.currentMoney?.reduce((sum, item) => sum + item.count, 0) ?? 0,
      money: overrides.currentMoney ?? [],
      purchasesAvailable: overrides.purchasesAvailable ?? true,
      donationsAvailable: overrides.donationsAvailable ?? true,
      subscriptionsAvailable: overrides.subscriptionsAvailable ?? true,
      flowSubscriptions: overrides.flowSubscriptions ?? 0,
    },
    previous: {
      ...base.previous,
      paidCount: overrides.previousMoney?.reduce((sum, item) => sum + item.count, 0) ?? 0,
      money: overrides.previousMoney ?? [],
      purchasesAvailable: true,
      donationsAvailable: true,
      subscriptionsAvailable: true,
      flowSubscriptions: 0,
    },
  };
}

describe('self-funding', () => {
  it('calculates coverage, reinvestment and the next milestone from confirmed EUR revenue', () => {
    const result = buildSelfFunding({
      summary: summary({
        currentMoney: [{ currency: 'EUR', amountMinor: 30_000, count: 2 }],
        previousMoney: [{ currency: 'EUR', amountMinor: 20_000, count: 1 }],
      }),
      infrastructureCostEur: 200,
      infrastructureCostComplete: true,
      productionCostEur: 150,
    });
    expect(result.revenueEur).toBe(300);
    expect(result.revenueKind).toBe('actual');
    expect(result.coveragePct).toBe(150);
    expect(result.productionCoveragePct).toBe(200);
    expect(result.reinvestmentEur).toBe(100);
    expect(result.shortfallEur).toBe(0);
    expect(result.revenueDeltaEur).toBe(100);
    expect(result.revenueDeltaPct).toBe(50);
    expect(result.nextMilestone?.targetEur).toBe(500);
  });

  it('does not show zero when payments exist but the amount was not provided', () => {
    const base = summary({ currentMoney: [] });
    const result = buildSelfFunding({
      summary: {
        ...base,
        current: { ...base.current, paidCount: 2, money: [] },
      },
      infrastructureCostEur: 100,
      infrastructureCostComplete: true,
      productionCostEur: 80,
    });
    expect(result.revenueEur).toBeNull();
    expect(result.coveragePct).toBeNull();
  });

  it('converts USD revenue and never treats an incomplete source as zero', () => {
    const converted = buildSelfFunding({
      summary: summary({
        currentMoney: [{ currency: 'USD', amountMinor: 10_000, count: 1 }],
      }),
      infrastructureCostEur: 100,
      infrastructureCostComplete: true,
      productionCostEur: 80,
    });
    expect(converted.revenueEur).toBeCloseTo(100 / 1.0989, 5);

    const incomplete = buildSelfFunding({
      summary: summary({
        currentMoney: [],
        complete: false,
        purchasesAvailable: false,
      }),
      infrastructureCostEur: 100,
      infrastructureCostComplete: true,
      productionCostEur: 80,
    });
    expect(incomplete.revenueEur).toBeNull();
    expect(incomplete.coveragePct).toBeNull();
    expect(incomplete.reinvestmentEur).toBeNull();
    expect(incomplete.nextMilestone?.remainingEur).toBeNull();
  });

  it('does not invent a subscription amount and does not add it to revenue', () => {
    const result = buildSelfFunding({
      summary: summary({
        currentMoney: [{ currency: 'EUR', amountMinor: 5_000, count: 1 }],
        flowSubscriptions: 3,
      }),
      infrastructureCostEur: 50,
      infrastructureCostComplete: true,
      productionCostEur: 40,
    });
    expect(result.revenueEur).toBe(50);
    expect(result.subscriptionCount).toBe(3);
    expect(result.subscriptionRevenueUnknown).toBe(true);
    expect(result.revenueSourcesComplete).toBe(false);
    expect(result.notes.some((note) => note.includes('Flow'))).toBe(true);
  });

  it('does not turn subscription-only revenue into zero', () => {
    const result = buildSelfFunding({
      summary: summary({ currentMoney: [], flowSubscriptions: 2 }),
      infrastructureCostEur: 50,
      infrastructureCostComplete: true,
      productionCostEur: 40,
    });
    expect(result.revenueEur).toBeNull();
    expect(result.coveragePct).toBeNull();
    expect(result.subscriptionCount).toBe(2);
  });

  it('refuses coverage and reinvestment when infrastructure has unknown components', () => {
    const result = buildSelfFunding({
      summary: summary({
        currentMoney: [{ currency: 'EUR', amountMinor: 10_000, count: 1 }],
      }),
      infrastructureCostEur: 100,
      infrastructureCostComplete: false,
      productionCostEur: 80,
    });
    expect(result.coveragePct).toBe(100);
    expect(result.reinvestmentEur).toBeNull();
    expect(result.shortfallEur).toBeNull();
    expect(result.notes.some((note) => note.includes('неизвестные'))).toBe(true);
  });

  it('shows a shortfall without calling it reinvestment', () => {
    const result = buildSelfFunding({
      summary: summary({
        currentMoney: [{ currency: 'EUR', amountMinor: 5_000, count: 1 }],
      }),
      infrastructureCostEur: 200,
      infrastructureCostComplete: true,
      productionCostEur: 160,
    });
    expect(result.reinvestmentEur).toBe(-150);
    expect(result.shortfallEur).toBe(150);
  });

  it('uses the existing Dev Cost Ledger as a bridge and never adds it to the run rate', () => {
    const report = buildCostReport({ scenario: scenarioPreset('comfortable') });
    const ledger = {
      periodDays: 30,
      periodFrom: '2026-10-19T00:00:00.000Z',
      period: {
        estimate: { expectedUsd: 20 },
        actual: { totalUsd: 25 },
        variance: { deltaUsd: 5, deltaPct: 25 },
      },
      dataQuality: { attemptsMissingCost: 1, unknown: ['one attempt without cost'] },
    } as unknown as Parameters<typeof buildDevLedgerBridge>[0];

    const bridge = buildDevLedgerBridge(ledger);
    expect(bridge.available).toBe(true);
    expect(bridge.includedInRunRate).toBe(false);
    expect(bridge.actualEstimatedUsd).toBe(25);
    expect(bridge.actualEstimatedEur).toBeCloseTo(25 / 1.0989, 5);
    expect(bridge.varianceUsd).toBe(5);
    // The bridge is display-only: the infrastructure report does not change.
    expect(report.summary.monthlyKnownEur).toBeGreaterThan(0);
  });

  it('returns an unavailable bridge instead of zero when the ledger is not ready', () => {
    const bridge = buildDevLedgerBridge(null);
    expect(bridge.available).toBe(false);
    expect(bridge.actualEstimatedUsd).toBeNull();
    expect(bridge.actualEstimatedEur).toBeNull();
    expect(bridge.includedInRunRate).toBe(false);
  });
});
