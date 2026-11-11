/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  formatReportingPeriod,
  resolveReportingPeriod,
  startOfZonedDay,
  zonedWallTimeToUtc,
} from '../reportingPeriod';

const now = new Date('2026-11-02T12:00:00.000Z');
const timezone = 'Europe/London';

describe('Pierrot reporting periods', () => {
  it('uses timezone-aware calendar days for the last seven days', () => {
    const period = resolveReportingPeriod('last_7_days', now, timezone);

    expect(period.start.toISOString()).toBe('2026-10-27T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(period.previous.start.toISOString()).toBe('2026-10-19T23:00:00.000Z');
    expect(period.previous.end.toISOString()).toBe('2026-10-27T00:00:00.000Z');
  });

  it('keeps month boundaries and the previous month separate', () => {
    const current = resolveReportingPeriod('current_month', now, timezone);
    const previous = resolveReportingPeriod('previous_month', now, timezone);

    expect(current.start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(previous.start.toISOString()).toBe('2026-09-30T23:00:00.000Z');
    expect(previous.end.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('handles a DST boundary when converting a wall time', () => {
    const before = zonedWallTimeToUtc(
      { year: 2026, month: 3, day: 29, hour: 0 },
      timezone
    );

    expect(before.toISOString()).toBe('2026-03-29T00:00:00.000Z');
  });

  it('states the analysed period explicitly', () => {
    const period = resolveReportingPeriod('last_7_days', now, timezone);

    expect(formatReportingPeriod(period, 'ru')).toContain('последние семь дней');
    expect(formatReportingPeriod(period, 'ru')).toContain('Europe/London');
  });

  it('starts the day at local midnight, not UTC midnight in summer', () => {
    const summer = new Date('2026-07-15T12:00:00.000Z');
    const start = startOfZonedDay(summer, timezone);

    expect(start.toISOString()).toBe('2026-07-14T23:00:00.000Z');
  });

  it('supports today, yesterday and calendar weeks', () => {
    const today = resolveReportingPeriod('today', now, timezone);
    const yesterday = resolveReportingPeriod('yesterday', now, timezone);
    // 2026-11-02 is a Monday, so "this week" starts on the same day.
    const thisWeek = resolveReportingPeriod('this_week', now, timezone);
    const lastWeek = resolveReportingPeriod('last_week', now, timezone);

    expect(today.start.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(yesterday.end.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(thisWeek.start.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(lastWeek.start.toISOString()).toBe('2026-10-26T00:00:00.000Z');
    expect(lastWeek.end.toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('supports years and all time without pretending all time has a comparison', () => {
    const thisYear = resolveReportingPeriod('this_year', now, timezone);
    const previousYear = resolveReportingPeriod('previous_year', now, timezone);
    const allTime = resolveReportingPeriod('all_time', now, timezone);

    expect(thisYear.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(previousYear.start.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(allTime.start.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    expect(allTime.comparisonAvailable).toBe(false);
  });

  it('labels every new period explicitly', () => {
    expect(formatReportingPeriod(resolveReportingPeriod('today', now, timezone), 'ru')).toContain('сегодня');
    expect(formatReportingPeriod(resolveReportingPeriod('last_week', now, timezone), 'ru')).toContain('прошлая неделя');
    expect(formatReportingPeriod(resolveReportingPeriod('this_year', now, timezone), 'ru')).toContain('текущий год');
    expect(formatReportingPeriod(resolveReportingPeriod('all_time', now, timezone), 'ru')).toContain('всё время');
  });
});
