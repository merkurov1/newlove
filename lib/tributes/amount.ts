/**
 * Shared Tribute amount rules.
 *
 * The browser and the checkout API must agree on the smallest and largest
 * accepted amount. Stripe's USD limit is 99,999,999 minor units.
 */
export const MIN_TRIBUTE_AMOUNT = 1;
export const MAX_TRIBUTE_AMOUNT = 999999.99;
export const MAX_TRIBUTE_CENTS = 99999999;

const INPUT_PATTERN = /^\d{0,6}([.,]\d{0,2})?$/;

/** Characters a visitor may keep while typing a custom amount. */
export function isPartialTributeAmount(value: string): boolean {
  return value === '' || INPUT_PATTERN.test(value);
}

/**
 * Converts a user-entered amount (e.g. "20", "7,50") to a finite USD number.
 * Returns null for empty, malformed, or out-of-range values.
 */
export function parseTributeAmountInput(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;

  const amount = Number(trimmed);

  if (!Number.isFinite(amount)) return null;

  return amount >= MIN_TRIBUTE_AMOUNT && amount <= MAX_TRIBUTE_AMOUNT
    ? amount
    : null;
}

/**
 * Server-side conversion to Stripe minor units.
 *
 * The returned value is always an integer in the inclusive range
 * 100..99999999, or null when the amount must be rejected.
 */
export function toTributeCents(value: unknown): number | null {
  const amount = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(amount)) return null;

  if (amount < MIN_TRIBUTE_AMOUNT || amount > MAX_TRIBUTE_AMOUNT) return null;

  const cents = Math.round(amount * 100);

  if (!Number.isInteger(cents) || cents < 100 || cents > MAX_TRIBUTE_CENTS) {
    return null;
  }

  return cents;
}
