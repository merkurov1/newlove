import type { CommercialMoneyTotal, CommercialSummary } from '@/lib/pierrot/commercialSummary';
import type { DevCostLedger } from '@/lib/pierrot/dev/workbench/types';
import type { DevLedgerBridge, FxRate, InfraCurrency, SelfFunding } from './types';
import { fxRateFor, round6 } from './fx';

export const SELF_FUNDING_MILESTONES = [50, 100, 200, 500] as const;

const SUPPORTED: InfraCurrency[] = ['EUR', 'USD', 'CHF', 'GBP'];

function currencyOf(value: unknown): InfraCurrency | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return (SUPPORTED as string[]).includes(upper) ? (upper as InfraCurrency) : null;
}

/**
 * Convert confirmed commercial money to EUR. This deliberately reads only
 * confirmed purchases/donations; checkout starts, shown offers and internal
 * transfers are not part of CommercialSummary in the first place.
 */
export function revenueToEur(
  totals: CommercialMoneyTotal[],
  rates: Record<InfraCurrency, FxRate>
): { eur: number | null; unknownCurrency: string | null } {
  if (!Array.isArray(totals) || totals.length === 0) return { eur: 0, unknownCurrency: null };
  let sum = 0;
  for (const total of totals) {
    const currency = currencyOf(total.currency);
    if (!currency) return { eur: null, unknownCurrency: total.currency || 'unknown' };
    if (!Number.isFinite(total.amountMinor)) return { eur: null, unknownCurrency: null };
    sum += (total.amountMinor / 100) * rates[currency].eurPerUnit;
  }
  return { eur: round6(sum), unknownCurrency: null };
}

function periodRevenue(
  summary: CommercialSummary,
  which: 'current' | 'previous',
  rates: Record<InfraCurrency, FxRate>
): { eur: number | null; complete: boolean; reason: string | null } {
  const period = summary[which];
  const sourcesComplete =
    period.purchasesAvailable && period.donationsAvailable && period.subscriptionsAvailable;
  const converted = revenueToEur(period.money, rates);
  if (converted.unknownCurrency) {
    return {
      eur: null,
      complete: false,
      reason: `Нет курса EUR для валюты ${converted.unknownCurrency}.`,
    };
  }
  if (converted.eur === null) {
    return { eur: null, complete: false, reason: 'Сумма выручки не конвертируется.' };
  }
  if (converted.eur === 0 && period.paidCount > 0) {
    return {
      eur: null,
      complete: false,
      reason: 'Подтверждённые оплаты есть, но источник не передал сумму. Ноль не подставляется.',
    };
  }
  if (converted.eur === 0 && period.flowSubscriptions > 0) {
    return {
      eur: null,
      complete: false,
      reason:
        'Подтверждённые Flow-подписки есть, но их сумма не передаётся. Ноль не подставляется.',
    };
  }
  if (!sourcesComplete) {
    return {
      // Zero confirmed rows from an incomplete source are not a zero-revenue fact.
      eur: converted.eur === 0 ? null : converted.eur,
      complete: false,
      reason:
        converted.eur === 0
          ? 'Коммерческие источники недоступны; ноль не подставляется.'
          : 'Часть коммерческих источников недоступна; сумма является нижней границей.',
    };
  }
  return { eur: converted.eur, complete: true, reason: null };
}

export function buildSelfFunding(input: {
  summary: CommercialSummary;
  infrastructureCostEur: number;
  infrastructureCostComplete: boolean;
  productionCostEur: number;
  now?: Date;
  rates?: Record<InfraCurrency, FxRate>;
}): SelfFunding {
  const now = input.now || new Date();
  const rates: Record<InfraCurrency, FxRate> = input.rates || {
    EUR: fxRateFor('EUR', now),
    USD: fxRateFor('USD', now),
    CHF: fxRateFor('CHF', now),
    GBP: fxRateFor('GBP', now),
  };
  const current = periodRevenue(input.summary, 'current', rates);
  const previous = periodRevenue(input.summary, 'previous', rates);
  const currentStartMs = new Date(input.summary.start).getTime();
  const currentEndMs = new Date(input.summary.end).getTime();
  const durationMs =
    Number.isFinite(currentStartMs) &&
    Number.isFinite(currentEndMs) &&
    currentEndMs > currentStartMs
      ? currentEndMs - currentStartMs
      : 0;
  const previousWindow = {
    start:
      durationMs > 0 ? new Date(currentStartMs - durationMs).toISOString() : input.summary.start,
    end: input.summary.start,
  };
  const subscriptionsUnknown = input.summary.current.flowSubscriptions > 0;
  const revenueKind = current.eur === null ? 'unknown' : 'actual';
  const cost = Math.max(0, input.infrastructureCostEur);
  const coverage = current.eur === null || cost <= 0 ? null : round6((current.eur / cost) * 100);
  const productionCoverage =
    current.eur === null || input.productionCostEur <= 0
      ? null
      : round6((current.eur / input.productionCostEur) * 100);
  const delta =
    current.eur === null || previous.eur === null ? null : round6(current.eur - previous.eur);
  const deltaPct =
    delta === null || previous.eur === null || previous.eur === 0
      ? null
      : Math.round((delta / previous.eur) * 1000) / 10;
  const reinvestment =
    current.eur === null || !input.infrastructureCostComplete ? null : round6(current.eur - cost);
  const shortfall =
    current.eur === null || !input.infrastructureCostComplete
      ? null
      : round6(Math.max(0, cost - current.eur));

  const milestones = SELF_FUNDING_MILESTONES.map((target) => ({
    targetEur: target,
    reached: current.eur !== null && current.eur >= target,
    remainingEur: current.eur === null ? null : round6(Math.max(0, target - current.eur)),
  }));
  const nextMilestone = milestones.find((milestone) => !milestone.reached) || null;

  const notes = [
    'В выручку входят только подтверждённые покупки и донаты. Checkout starts, показы офферов и внутренние переводы не считаются выручкой.',
    'Revenue — это не profit: инфраструктурная стоимость покрывает только перечисленные recurring-сервисы, но не налоги, эквайринг и труд.',
    'Если часть источников недоступна, coverage рассчитан от нижней границы выручки и не является гарантией.',
    'FX зафиксирован на 2026-11-17 (ECB) и хранится вместе с суммами.',
  ];
  if (subscriptionsUnknown) {
    notes.push(
      `Подтверждённых Flow-подписок: ${input.summary.current.flowSubscriptions}, но их денежная сумма не передаётся источником. Она не добавлена к выручке.`
    );
  }
  if (!input.infrastructureCostComplete) {
    notes.push(
      'Infrastructure cost содержит неизвестные компоненты. Reinvestment не рассчитывается, чтобы не выдать неполную сумму за факт.'
    );
  }

  return {
    periodLabel: input.summary.periodLabel,
    periodStart: input.summary.start,
    periodEnd: input.summary.end,
    previousPeriodStart: previousWindow.start,
    previousPeriodEnd: previousWindow.end,
    revenueEur: current.eur,
    previousRevenueEur: previous.eur,
    revenueKind,
    revenueSourcesComplete: current.complete && !subscriptionsUnknown,
    revenueUnknownReason: current.reason,
    subscriptionCount: input.summary.current.flowSubscriptions,
    subscriptionRevenueUnknown: subscriptionsUnknown,
    infrastructureCostEur: round6(cost),
    infrastructureCostComplete: input.infrastructureCostComplete,
    productionCostEur: round6(Math.max(0, input.productionCostEur)),
    coveragePct: coverage,
    productionCoveragePct: productionCoverage,
    revenueDeltaEur: delta,
    revenueDeltaPct: deltaPct,
    reinvestmentEur: reinvestment,
    shortfallEur: shortfall,
    nextMilestone,
    milestones,
    notes,
  };
}

/**
 * Bridge to the existing Dev Cost Ledger. The ledger is the source of truth for
 * task execution cost. Its amount is shown for cross-checking and is never added
 * to the infrastructure run-rate, because the Codespaces run-rate line already
 * covers the same account-level usage.
 */
export function buildDevLedgerBridge(
  ledger: DevCostLedger | null,
  now: Date = new Date()
): DevLedgerBridge {
  if (!ledger) {
    return {
      available: false,
      note: 'Dev Cost Ledger недоступен или схема ещё не применена. Дублирования нет: инфраструктурный расчёт не подставляет его сумму.',
      periodDays: 30,
      periodFrom: null,
      actualEstimatedUsd: null,
      actualEstimatedEur: null,
      expectedUsd: null,
      varianceUsd: null,
      variancePct: null,
      attemptsMissingCost: 0,
      unknown: ['dev ledger unavailable'],
      includedInRunRate: false,
    };
  }
  const rate = fxRateFor('USD', now);
  const actual = ledger.period.actual.totalUsd;
  return {
    available: true,
    note: 'Сумма Dev Cost Ledger показана отдельно как стоимость выполнения задач. Она не добавлена к infrastructure run rate и не дублирует Codespaces-линию.',
    periodDays: ledger.periodDays,
    periodFrom: ledger.periodFrom,
    actualEstimatedUsd: actual,
    actualEstimatedEur: actual === null ? null : round6(actual * rate.eurPerUnit),
    expectedUsd: ledger.period.estimate.expectedUsd,
    varianceUsd: ledger.period.variance.deltaUsd,
    variancePct: ledger.period.variance.deltaPct,
    attemptsMissingCost: ledger.dataQuality.attemptsMissingCost,
    unknown: ledger.dataQuality.unknown,
    includedInRunRate: false,
  };
}
