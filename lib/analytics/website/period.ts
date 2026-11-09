import { assertServerOnly } from '@/lib/serverOnly';
import {
  addZonedDays,
  resolveReportingPeriod,
  parseCalendarDate,
  type ReportingPeriod,
  type ReportingPeriodKey,
} from '@/lib/pierrot/reportingPeriod';
import type { AnalyticsPeriod } from './types';

assertServerOnly('lib/analytics/website/period');

function isoDay(date: Date, timezone: string): string {
  // en-CA gives YYYY-MM-DD; formatting in the reporting timezone avoids
  // shifting a London evening into the next UTC day.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatLabel(start: string, end: string, language: 'ru' | 'en'): string {
  const formatter = new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const a = formatter.format(new Date(`${start}T12:00:00.000Z`)).replace(/\.$/, '');
  const b = formatter.format(new Date(`${end}T12:00:00.000Z`)).replace(/\.$/, '');

  return `${a} — ${b}`;
}

export function toAnalyticsPeriod(
  period: ReportingPeriod,
  options: { comparisonRequested?: boolean; language?: 'ru' | 'en' } = {}
): AnalyticsPeriod {
  const language = options.language ?? 'ru';
  const start = isoDay(period.start, period.timezone);
  const end = isoDay(new Date(period.end.getTime() - 1), period.timezone);
  const previousStart = isoDay(period.previous.start, period.timezone);
  const previousEnd = isoDay(new Date(period.previous.end.getTime() - 1), period.timezone);

  return {
    key: period.key,
    label: formatLabel(start, end, language),
    timezone: period.timezone,
    start,
    end,
    previousStart,
    previousEnd,
    previousLabel: formatLabel(previousStart, previousEnd, language),
    comparisonRequested: options.comparisonRequested ?? true,
  };
}

export function resolveWebsitePeriod(input: {
  periodKey: ReportingPeriodKey;
  customPeriod?: { start: string; end: string };
  timezone: string;
  now?: Date;
  comparisonRequested?: boolean;
  language?: 'ru' | 'en';
}): AnalyticsPeriod {
  const period = resolveReportingPeriod(
    input.periodKey,
    input.now ?? new Date(),
    input.timezone,
    input.customPeriod
  );

  return toAnalyticsPeriod(period, {
    comparisonRequested: input.comparisonRequested,
    language: input.language,
  });
}

export function periodForPreset(
  days: 7 | 30 | 90,
  timezone: string,
  now: Date = new Date()
): AnalyticsPeriod {
  const period = resolveReportingPeriod(
    days === 30 ? 'last_30_days' : 'last_7_days',
    now,
    timezone
  );

  if (days === 90) {
    const start = addZonedDays(period.start, -83, timezone);
    const previousStart = addZonedDays(start, -90, timezone);

    return toAnalyticsPeriod(
      {
        ...period,
        key: 'custom',
        start,
        previous: { start: previousStart, end: start },
        custom: { start: isoDay(start, timezone), end: isoDay(new Date(period.end.getTime() - 1), timezone) },
      },
      { language: 'ru' }
    );
  }

  return toAnalyticsPeriod(period, { language: 'ru' });
}

export function previousWindow(start: string, end: string): { start: string; end: string } {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
  const previousEnd = new Date(startDate.getTime() - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86_400_000);

  return {
    start: previousStart.toISOString().slice(0, 10),
    end: previousEnd.toISOString().slice(0, 10),
  };
}

export function daysBetween(start: string, end: string): number {
  const a = parseCalendarDate(start, 'UTC');
  const b = parseCalendarDate(end, 'UTC');
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}
