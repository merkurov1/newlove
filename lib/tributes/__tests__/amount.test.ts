import {
  MAX_TRIBUTE_AMOUNT,
  MAX_TRIBUTE_CENTS,
  MIN_TRIBUTE_AMOUNT,
  isPartialTributeAmount,
  parseTributeAmountInput,
  toTributeCents,
} from '@/lib/tributes/amount';

describe('Tribute amounts', () => {
  it('accepts the three presets and decimal custom amounts', () => {
    expect(toTributeCents(5)).toBe(500);
    expect(toTributeCents(20)).toBe(2000);
    expect(toTributeCents(100)).toBe(10000);
    expect(toTributeCents(7.5)).toBe(750);
    expect(toTributeCents('7.50')).toBe(750);
  });

  it('rejects amounts Stripe or the product cannot accept', () => {
    expect(toTributeCents(0)).toBeNull();
    expect(toTributeCents(0.99)).toBeNull();
    expect(toTributeCents(-5)).toBeNull();
    expect(toTributeCents(Number.NaN)).toBeNull();
    expect(toTributeCents(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toTributeCents(MAX_TRIBUTE_AMOUNT + 0.01)).toBeNull();
  });

  it('never returns a non-integer or out-of-range minor amount', () => {
    expect(toTributeCents(MIN_TRIBUTE_AMOUNT)).toBe(100);
    expect(toTributeCents(MAX_TRIBUTE_AMOUNT)).toBe(MAX_TRIBUTE_CENTS);
    expect(toTributeCents(1.006)).toBe(101);
  });

  it('parses comma decimal separators without accepting negative values', () => {
    expect(parseTributeAmountInput('7,50')).toBe(7.5);
    expect(parseTributeAmountInput('7.50')).toBe(7.5);
    expect(parseTributeAmountInput('-7')).toBeNull();
    expect(parseTributeAmountInput('')).toBeNull();
    expect(parseTributeAmountInput('1.234')).toBeNull();
  });

  it('lets the mobile input keep intermediate values but not letters', () => {
    expect(isPartialTributeAmount('')).toBe(true);
    expect(isPartialTributeAmount('20')).toBe(true);
    expect(isPartialTributeAmount('20.')).toBe(true);
    expect(isPartialTributeAmount('20,5')).toBe(true);
    expect(isPartialTributeAmount('12a')).toBe(false);
    expect(isPartialTributeAmount('1.234')).toBe(false);
  });
});
