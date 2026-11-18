import type { FxRate, InfraCurrency } from './types';

/**
 * FX is a manually configured, versioned fact. The default is the ECB
 * reference rate published on 2026-11-17 (the latest working day before the
 * price audit on 2026-11-18). It is never silently refreshed: a changed rate
 * creates a new checkedAt/source pair that is stored with every converted
 * amount.
 *
 * Optional non-secret environment overrides exist for operators who need their
 * card's billing rate. They are marked as an environment override, not ECB.
 */

export const FX_CHECKED_AT = '2026-11-17T14:15:00.000Z';
export const FX_SOURCE =
  'ECB euro foreign exchange reference rates, https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html';

// ECB quotes units of currency per 1 EUR. EUR per unit is the reciprocal.
const ECB_UNITS_PER_EUR: Record<InfraCurrency, number> = {
  EUR: 1,
  USD: 1.0989,
  CHF: 0.9233,
  GBP: 0.83305,
};

function finitePositive(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function envOverride(currency: InfraCurrency): number | null {
  const env = typeof process !== 'undefined' && process.env ? process.env : null;
  if (!env) return null;
  // Static property access keeps Next's client env replacement predictable.
  const raw =
    currency === 'USD'
      ? env.PIERROT_INFRA_FX_EUR_PER_USD
      : currency === 'CHF'
        ? env.PIERROT_INFRA_FX_EUR_PER_CHF
        : currency === 'GBP'
          ? env.PIERROT_INFRA_FX_EUR_PER_GBP
          : env.PIERROT_INFRA_FX_EUR_PER_EUR;
  if (raw === undefined || raw.trim() === '') return null;
  return finitePositive(raw);
}

export function fxRateFor(currency: InfraCurrency, now: Date = new Date()): FxRate {
  const override = envOverride(currency);
  if (override !== null) {
    return {
      currency,
      eurPerUnit: override,
      source: `PIERROT_INFRA_FX_EUR_PER_${currency} environment override`,
      checkedAt: now.toISOString(),
      kind: 'manual',
    };
  }
  const unitsPerEur = ECB_UNITS_PER_EUR[currency];
  return {
    currency,
    eurPerUnit: currency === 'EUR' ? 1 : 1 / unitsPerEur,
    source: FX_SOURCE,
    checkedAt: FX_CHECKED_AT,
    kind: 'manual',
  };
}

export function allFxRates(): FxRate[] {
  return (['EUR', 'USD', 'CHF', 'GBP'] as InfraCurrency[]).map((currency) => fxRateFor(currency));
}

export function convertToEur(
  amount: number | null,
  currency: InfraCurrency,
  rate: FxRate
): number | null {
  if (amount === null || !Number.isFinite(amount)) return null;
  return round6(amount * rate.eurPerUnit);
}

export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatEur(value: number | null, maximumFractionDigits = 2): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits,
  }).format(value);
}

export function formatNative(value: number | null, currency: InfraCurrency): string {
  if (value === null || !Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 4,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
