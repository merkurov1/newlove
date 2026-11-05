import {
  commercialHomeStatus,
  commercialVerdict,
  emptyCommercialSummary,
  formatCommercialMoney,
  russianCountLabel,
  russianPayments,
  type CommercialSummary,
} from '@/lib/pierrot/commercialSummary';

function summary(
  currentPaid: number,
  previousPaid: number,
  flow = 0,
  complete = true
): CommercialSummary {
  const base = emptyCommercialSummary('last_7_days');
  return {
    ...base,
    complete,
    current: { ...base.current, paidCount: currentPaid, flowSubscriptions: flow },
    previous: { ...base.previous, paidCount: previousPaid },
  };
}

describe('commercial summary', () => {
  it('formats multiple currencies separately', () => {
    expect(
      formatCommercialMoney([
        { currency: 'GBP', amountMinor: 12000, count: 1 },
        { currency: 'USD', amountMinor: 4000, count: 1 },
      ])
    ).toContain('£');
  });

  it('declines to imply growth when data is incomplete and nothing is confirmed', () => {
    const verdict = commercialVerdict(summary(0, 0, 0, false));
    expect(verdict.tone).toBe('unknown');
    expect(verdict.headline).toContain('данные неполные');
  });

  it('does not claim a definitive result when a money source is missing', () => {
    const verdict = commercialVerdict(summary(1, 0, 0, false));
    expect(verdict.tone).toBe('unknown');
    expect(verdict.headline).toContain('Частично');
  });

  it('reports growth only from confirmed payments', () => {
    const verdict = commercialVerdict(summary(2, 1, 3));
    expect(verdict.tone).toBe('up');
    expect(verdict.headline).toBe('Да, разбогатели.');
    expect(verdict.detail).toContain('2 подтверждённые оплаты');
    expect(verdict.detail).toContain('Flow +3');
  });

  it('reports a quieter period without inventing a cause', () => {
    const verdict = commercialVerdict(summary(0, 2));
    expect(verdict.tone).toBe('down');
    expect(verdict.headline).toBe('Нет, тише прошлого периода.');
  });

  it('does not call zero sales a growth', () => {
    const verdict = commercialVerdict(summary(0, 0));
    expect(verdict.tone).toBe('none');
    expect(verdict.headline).toBe('Нет, разбогатели не сегодня.');
  });

  it('keeps the compact home indicator quiet when nothing is confirmed', () => {
    expect(commercialHomeStatus(summary(0, 0))).toEqual({
      label: 'Пока тихо',
      tone: 'quiet',
    });
  });

  it('reports growth only from confirmed activity', () => {
    expect(commercialHomeStatus(summary(2, 1)).label).toBe('Разбогатели!');
    expect(commercialHomeStatus(summary(3, 3)).label).toBe('Деньги есть');
  });

  it('reports no money when the previous period had confirmed payments', () => {
    expect(commercialHomeStatus(summary(0, 2))).toEqual({
      label: 'Нет денег',
      tone: 'down',
    });
  });

  it('never claims a confident zero when sources are incomplete', () => {
    expect(commercialHomeStatus(summary(0, 0, 0, false))).toEqual({
      label: 'Данные неполные',
      tone: 'unknown',
    });
    expect(commercialHomeStatus(summary(1, 0, 0, false))).toEqual({
      label: 'Деньги есть',
      tone: 'positive',
    });
  });

  it('counts confirmed Flow subscriptions as money activity', () => {
    expect(commercialHomeStatus(summary(0, 0, 1)).label).toBe('Разбогатели!');
  });

  it('uses Russian plural forms for payments', () => {
    expect(russianPayments(1)).toBe('1 подтверждённая оплата');
    expect(russianPayments(2)).toBe('2 подтверждённые оплаты');
    expect(russianPayments(5)).toBe('5 подтверждённых оплат');
    expect(russianPayments(11)).toBe('11 подтверждённых оплат');
    expect(russianPayments(21)).toBe('21 подтверждённая оплата');
    expect(russianCountLabel(1, 'покупка', 'покупки', 'покупок')).toBe('1 покупка');
    expect(russianCountLabel(3, 'покупка', 'покупки', 'покупок')).toBe('3 покупки');
    expect(russianCountLabel(12, 'покупка', 'покупки', 'покупок')).toBe('12 покупок');
  });
});
