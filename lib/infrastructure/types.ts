/**
 * Client-safe contracts for the Pierrot infrastructure cost calculator.
 *
 * The calculator is deliberately explicit about provenance:
 *   * `actual` is a confirmed invoice/revenue fact from a source of record.
 *   * `provider-reported` is provider-reported usage (the amount may still be
 *     derived from a published tariff).
 *   * `estimate` is a reproducible calculation from versioned public prices and
 *     scenario usage.
 *   * `manual` is a value the owner configured (plan choice, contract price).
 *   * `unknown` is never rendered or summed as zero.
 */

export const INFRA_CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP'] as const;
export type InfraCurrency = (typeof INFRA_CURRENCIES)[number];

export type CostKind = 'actual' | 'provider-reported' | 'estimate' | 'manual' | 'unknown';
export type Confidence = 'high' | 'medium' | 'low' | 'unknown';
export type CostClass = 'fixed' | 'variable' | 'one-off';
export type CostAllocation = 'production' | 'development' | 'media';

export type FxRate = {
  currency: InfraCurrency;
  /** How many EUR one unit of `currency` buys. */
  eurPerUnit: number;
  source: string;
  checkedAt: string;
  kind: CostKind;
};

export type CostLine = {
  id: string;
  provider: string;
  providerLabel: string;
  category: string;
  label: string;
  description: string;
  costClass: CostClass;
  allocation: CostAllocation;
  /** Optional split for shared fixed hosts. Shares are normalised to 1. */
  allocationShares: Partial<Record<CostAllocation, number>> | null;
  currency: InfraCurrency;
  nativeAmount: number | null;
  eurAmount: number | null;
  amountKind: CostKind;
  usageQuantity: number | null;
  usageUnit: string | null;
  usageKind: CostKind | null;
  includedQuantity: number | null;
  overageQuantity: number | null;
  billingBasis: string;
  source: string;
  checkedAt: string;
  confidence: Confidence;
  pricingVersion: string;
  assumptions: string[];
  unknownReason: string | null;
  requiredPermission: string | null;
};

export type CostKindTotals = Record<CostKind, number | null>;

export type ProviderCostSummary = {
  provider: string;
  providerLabel: string;
  eur: number;
  sharePct: number | null;
  fixedEur: number;
  variableEur: number;
  productionEur: number;
  developmentEur: number;
  mediaEur: number;
  unknownLines: number;
  kinds: CostKind[];
};

export type CategoryCostSummary = {
  category: string;
  eur: number;
  unknownLines: number;
};

export type CostSummary = {
  currency: 'EUR';
  lineCount: number;
  knownLineCount: number;
  unknownLineCount: number;
  complete: boolean;
  monthlyKnownEur: number;
  annualKnownEur: number;
  actualEur: number | null;
  providerReportedEur: number | null;
  estimateEur: number | null;
  manualEur: number | null;
  unknownEur: null;
  fixedEur: number;
  variableEur: number;
  oneOffEur: number;
  recurringMonthlyEur: number;
  overageEur: number;
  byKind: CostKindTotals;
  byAllocation: Record<CostAllocation, number>;
  byProvider: ProviderCostSummary[];
  byCategory: CategoryCostSummary[];
  unknown: Array<{
    lineId: string;
    provider: string;
    providerLabel: string;
    label: string;
    reason: string;
    requiredPermission: string | null;
  }>;
};

export type CostReport = {
  generatedAt: string;
  scenario: import('./scenarios').Scenario;
  fx: FxRate[];
  lines: CostLine[];
  summary: CostSummary;
  budget: BudgetAssessment;
};

export type BudgetAssessment = {
  budgetEur: number;
  warnAtPct: number;
  usedPct: number | null;
  status: 'ok' | 'warning' | 'over' | 'incomplete';
  message: string;
};

export type ActualStatus = {
  provider: string;
  providerLabel: string;
  status: 'provider-reported' | 'unavailable' | 'not-configured' | 'manual';
  source: string;
  checkedAt: string;
  /** Confirmed charge in EUR when a source of record exposes it. */
  actualChargeEur: number | null;
  usageSummary: string | null;
  reason: string | null;
  requiredPermission: string | null;
};

export type SelfFundingMilestone = {
  targetEur: number;
  reached: boolean;
  remainingEur: number | null;
};

export type SelfFunding = {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
  revenueEur: number | null;
  previousRevenueEur: number | null;
  revenueKind: CostKind;
  revenueSourcesComplete: boolean;
  revenueUnknownReason: string | null;
  subscriptionCount: number;
  subscriptionRevenueUnknown: boolean;
  infrastructureCostEur: number;
  infrastructureCostComplete: boolean;
  productionCostEur: number;
  coveragePct: number | null;
  productionCoveragePct: number | null;
  revenueDeltaEur: number | null;
  revenueDeltaPct: number | null;
  reinvestmentEur: number | null;
  shortfallEur: number | null;
  nextMilestone: SelfFundingMilestone | null;
  milestones: SelfFundingMilestone[];
  notes: string[];
};

export type DevLedgerBridge = {
  available: boolean;
  note: string;
  periodDays: number;
  periodFrom: string | null;
  actualEstimatedUsd: number | null;
  actualEstimatedEur: number | null;
  expectedUsd: number | null;
  varianceUsd: number | null;
  variancePct: number | null;
  attemptsMissingCost: number;
  unknown: string[];
  /** True when this amount is already covered by the Codespaces run-rate line. */
  includedInRunRate: false;
};
