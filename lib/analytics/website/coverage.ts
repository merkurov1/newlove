import type {
  AnalyticsPeriod,
  AnalyticsProvider,
  SourceCoverage,
  SourceDataState,
  SourceFreshness,
} from './types';

/**
 * Requested-period coverage is a different question from connectivity.
 *
 * A source can be connected and authenticated while the requested window is
 * only 4/7 complete. These helpers do not read the database and do not invent
 * missing days: a missing day is unknown, not zero.
 */

export type CoverageInput = {
  provider: AnalyticsProvider | 'internal';
  period: Pick<AnalyticsPeriod, 'start' | 'end' | 'timezone'>;
  /** Distinct calendar dates that actually have rows. */
  dataDates: string[];
  lastSyncAt: string | null;
  configured: boolean;
  connected: boolean;
  error?: string | null;
  /** Search Console normally has a 2–3 day reporting delay. */
  reportingDelayDays?: number;
  now?: Date;
};

export function zonedDay(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function shiftDay(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function calendarDays(start: string, end: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 0;
  const a = Date.parse(`${start}T00:00:00.000Z`);
  const b = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

function freshnessFor(input: {
  expectedEnd: string;
  actualDataTo: string | null;
  expectedDays: number;
}): SourceFreshness {
  if (input.expectedDays === 0) return 'delayed';
  if (!input.actualDataTo) return 'unknown';
  const lag = calendarDays(input.actualDataTo, input.expectedEnd) - 1;
  if (lag <= 1) return 'fresh';
  if (lag <= 2) return 'delayed';
  return 'stale';
}

function stateFor(input: {
  configured: boolean;
  connected: boolean;
  error?: string | null;
  completeness: number | null;
  expectedDays: number;
  hasData: boolean;
}): SourceDataState {
  if (!input.configured) return 'not_configured';
  if (input.error || (!input.connected && !input.hasData)) return 'unavailable';
  if (!input.hasData || input.completeness === null) return 'stale';
  if (input.expectedDays === 0) return 'stale';
  if (input.completeness < 0.999) return 'partial';
  return 'complete';
}

export function buildSourceCoverage(input: CoverageInput): SourceCoverage {
  const delay = Math.max(0, input.reportingDelayDays ?? 0);
  const now = input.now ?? new Date();
  const today = zonedDay(now, input.period.timezone);
  const expectedEndCandidate = shiftDay(today, -delay);
  const expectedEnd =
    expectedEndCandidate > input.period.end
      ? input.period.end
      : expectedEndCandidate < input.period.start
        ? input.period.start
        : expectedEndCandidate;
  const expectedDays =
    expectedEndCandidate < input.period.start
      ? 0
      : calendarDays(input.period.start, expectedEnd);

  const inWindow = Array.from(
    new Set(
      input.dataDates.filter(
        (date) =>
          /^\d{4}-\d{2}-\d{2}$/.test(date) &&
          date >= input.period.start &&
          date <= input.period.end
      )
    )
  ).sort();
  const actualDataFrom = inWindow[0] ?? null;
  const actualDataTo = inWindow[inWindow.length - 1] ?? null;
  const coveredDays = inWindow.filter((date) => date <= expectedEnd).length;
  const completeness =
    expectedDays > 0 ? Number(Math.min(1, coveredDays / expectedDays).toFixed(4)) : null;
  const freshness = freshnessFor({ expectedEnd, actualDataTo, expectedDays });
  const state = stateFor({
    configured: input.configured,
    connected: input.connected,
    error: input.error,
    completeness,
    expectedDays,
    hasData: inWindow.length > 0,
  });

  return {
    provider: input.provider,
    requestedStart: input.period.start,
    requestedEnd: input.period.end,
    expectedEnd,
    actualDataFrom,
    actualDataTo,
    coveredDays,
    expectedDays,
    completeness,
    lastSyncAt: input.lastSyncAt,
    dataLagDays:
      actualDataTo === null
        ? null
        : Math.max(0, calendarDays(actualDataTo, input.period.end) - 1),
    reportingDelayDays: delay,
    freshness,
    state,
    note: input.error || null,
  };
}

export function coverageIsComparable(
  current: SourceCoverage | null | undefined,
  previous: SourceCoverage | null | undefined
): boolean {
  if (!current || !previous) return false;
  if (current.expectedDays === 0 || previous.expectedDays === 0) return false;
  const currentCompleteness = current.completeness ?? 0;
  const previousCompleteness = previous.completeness ?? 0;
  return currentCompleteness >= 0.999 && previousCompleteness >= 0.999;
}
