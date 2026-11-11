import type { PierrotMetricUnit } from '@/lib/pierrot/response/types';

export function formatBlockNumber(
  value: number | string | null | undefined,
  language: 'ru' | 'en'
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;

  const abs = Math.abs(value);
  const maximumFractionDigits = abs > 0 && abs < 10 ? 1 : 0;

  return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    maximumFractionDigits,
  }).format(value);
}

export function formatMetricValue(
  value: number | string | null,
  _unit: PierrotMetricUnit | undefined,
  language: 'ru' | 'en'
): string {
  if (value === null || value === undefined || value === '') return '—';

  if (typeof value === 'string') return value;

  return formatBlockNumber(value, language);
}

export function formatMetricUnit(unit: PierrotMetricUnit | undefined): string {
  switch (unit) {
    case 'count':
      return '';
    case 'percent':
      return '%';
    case 'seconds':
      return 's';
    case 'position':
      return '';
    case 'ratio':
      return '×';
    default:
      return '';
  }
}

export function formatChange(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

export function formatBlockDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatBlockDateShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}
