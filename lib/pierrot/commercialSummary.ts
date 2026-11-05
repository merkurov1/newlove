/**
 * Client-safe commercial summary contracts and deterministic copy.
 *
 * The server loader only counts confirmed purchases, donations and confirmed
 * Flow subscriptions. Interest, checkout starts and shown offers are never
 * treated as revenue.
 */

export type CommercialMoneyTotal = {
  currency: string;
  amountMinor: number;
  count: number;
};

export type CommercialProductSummary = {
  count: number;
  money: CommercialMoneyTotal[];
};

export type CommercialPeriodSummary = {
  paidCount: number;
  money: CommercialMoneyTotal[];
  postcards: CommercialProductSummary;
  unframed: CommercialProductSummary;
  tributes: CommercialProductSummary;
  flowSubscriptions: number;
  purchasesAvailable: boolean;
  donationsAvailable: boolean;
  subscriptionsAvailable: boolean;
};

export type CommercialSummary = {
  periodKey: 'last_7_days' | 'last_30_days';
  periodLabel: string;
  start: string;
  end: string;
  timezone: string;
  current: CommercialPeriodSummary;
  previous: CommercialPeriodSummary;
  overall: {
    postcards: CommercialProductSummary;
    tributes: CommercialProductSummary;
    flowSubscriptions: number;
    postcardsAvailable: boolean;
    tributesAvailable: boolean;
    subscriptionsAvailable: boolean;
  };
  complete: boolean;
  errors: string[];
};

export type CommercialVerdictTone = 'up' | 'flat' | 'down' | 'none' | 'unknown';

export type CommercialVerdict = {
  tone: CommercialVerdictTone;
  headline: string;
  detail: string;
};

export function formatCommercialMoney(totals: CommercialMoneyTotal[]): string {
  if (!Array.isArray(totals) || totals.length === 0) return '';

  return totals
    .map((total) => {
      try {
        return new Intl.NumberFormat('ru-RU', {
          style: 'currency',
          currency: total.currency,
          maximumFractionDigits: 2,
        }).format(total.amountMinor / 100);
      } catch {
        return `${(total.amountMinor / 100).toFixed(2)} ${total.currency}`;
      }
    })
    .join(' + ');
}

export function russianCountLabel(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const value = Math.abs(count);
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${count} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} ${few}`;
  }
  return `${count} ${many}`;
}

export function russianPayments(count: number): string {
  const value = Math.abs(count);
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${count} подтверждённая оплата`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} подтверждённые оплаты`;
  }
  return `${count} подтверждённых оплат`;
}

export function commercialVerdict(summary: CommercialSummary): CommercialVerdict {
  const current = summary.current;
  const previous = summary.previous;
  const money = formatCommercialMoney(current.money);
  const flow = current.flowSubscriptions;

  const base = [
    current.paidCount > 0 ? russianPayments(current.paidCount) : 'Подтверждённых оплат нет',
    money || (current.paidCount > 0 ? 'сумма не передана' : ''),
    flow > 0 ? `Flow +${flow}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  if (!summary.complete) {
    return {
      tone: 'unknown',
      headline:
        current.paidCount > 0
          ? 'Частично: есть подтверждённые оплаты.'
          : 'Не знаю: данные неполные.',
      detail:
        current.paidCount > 0
          ? `${base} · данные неполные`
          : 'Часть коммерческих источников недоступна. Ноль не подставляется.',
    };
  }

  if (current.paidCount === 0 && previous.paidCount === 0) {
    return {
      tone: 'none',
      headline: 'Нет, разбогатели не сегодня.',
      detail: base,
    };
  }

  if (current.paidCount === 0) {
    return {
      tone: 'down',
      headline: 'Нет, тише прошлого периода.',
      detail: base,
    };
  }

  if (current.paidCount > previous.paidCount) {
    return {
      tone: 'up',
      headline: 'Да, разбогатели.',
      detail: base,
    };
  }

  if (current.paidCount === previous.paidCount) {
    return {
      tone: 'flat',
      headline: 'Да, но не сильнее прошлого периода.',
      detail: base,
    };
  }

  return {
    tone: 'down',
    headline: 'Нет, меньше прошлого периода.',
    detail: base,
  };
}

export type CommercialHomeTone = 'positive' | 'quiet' | 'down' | 'unknown';

export type CommercialHomeStatus = {
  /** One short owner-facing phrase. No amounts or payment counts. */
  label: 'Нет денег' | 'Разбогатели!' | 'Деньги есть' | 'Пока тихо' | 'Данные неполные';
  tone: CommercialHomeTone;
};

/**
 * Compact home-screen money state.
 *
 * Only confirmed purchases, donations and confirmed Flow subscriptions are
 * counted. Checkout starts and shown offers are never treated as revenue.
 * When any required commercial source is unavailable the result is never a
 * confident zero: it is either partial ("Деньги есть") or "Данные неполные".
 */
export function commercialHomeStatus(summary: CommercialSummary): CommercialHomeStatus {
  const currentCount = summary.current.paidCount + summary.current.flowSubscriptions;
  const previousCount = summary.previous.paidCount + summary.previous.flowSubscriptions;

  if (!summary.complete) {
    return currentCount > 0
      ? { label: 'Деньги есть', tone: 'positive' }
      : { label: 'Данные неполные', tone: 'unknown' };
  }

  if (currentCount === 0 && previousCount === 0) {
    return { label: 'Пока тихо', tone: 'quiet' };
  }

  if (currentCount === 0) {
    return { label: 'Нет денег', tone: 'down' };
  }

  if (currentCount > previousCount) {
    return { label: 'Разбогатели!', tone: 'positive' };
  }

  return { label: 'Деньги есть', tone: 'positive' };
}

export function emptyCommercialPeriod(): CommercialPeriodSummary {
  return {
    paidCount: 0,
    money: [],
    postcards: { count: 0, money: [] },
    unframed: { count: 0, money: [] },
    tributes: { count: 0, money: [] },
    flowSubscriptions: 0,
    purchasesAvailable: false,
    donationsAvailable: false,
    subscriptionsAvailable: false,
  };
}

export function emptyCommercialSummary(
  periodKey: 'last_7_days' | 'last_30_days',
  now = new Date(),
  errors: string[] = ['commercial_summary_unavailable']
): CommercialSummary {
  const period = emptyCommercialPeriod();

  return {
    periodKey,
    periodLabel: periodKey === 'last_7_days' ? '7 дней' : '30 дней',
    start: now.toISOString(),
    end: now.toISOString(),
    timezone: 'Europe/London',
    current: period,
    previous: emptyCommercialPeriod(),
    overall: {
      postcards: { count: 0, money: [] },
      tributes: { count: 0, money: [] },
      flowSubscriptions: 0,
      postcardsAvailable: false,
      tributesAvailable: false,
      subscriptionsAvailable: false,
    },
    complete: false,
    errors,
  };
}
