/** @jest-environment node */

import { buildSourceCoverage, calendarDays, coverageIsComparable } from '../coverage';

const NOW = new Date('2026-11-11T12:00:00.000Z');
const period = {
  start: '2026-11-05',
  end: '2026-11-11',
  timezone: 'Europe/London',
};

describe('analytics period coverage', () => {
  it('marks a complete seven-day window as complete and fresh', () => {
    const coverage = buildSourceCoverage({
      provider: 'google_analytics',
      period,
      dataDates: [
        '2026-11-05',
        '2026-11-06',
        '2026-11-07',
        '2026-11-08',
        '2026-11-09',
        '2026-11-10',
        '2026-11-11',
      ],
      lastSyncAt: '2026-11-11T10:00:00.000Z',
      configured: true,
      connected: true,
      now: NOW,
    });

    expect(coverage.state).toBe('complete');
    expect(coverage.freshness).toBe('fresh');
    expect(coverage.coveredDays).toBe(7);
    expect(coverage.expectedDays).toBe(7);
    expect(coverage.completeness).toBe(1);
  });

  it('does not call four of seven days complete', () => {
    const coverage = buildSourceCoverage({
      provider: 'google_analytics',
      period,
      dataDates: ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
      lastSyncAt: '2026-11-11T10:00:00.000Z',
      configured: true,
      connected: true,
      now: NOW,
    });

    expect(coverage.state).toBe('partial');
    expect(coverage.completeness).toBeCloseTo(4 / 7, 4);
    expect(coverage.actualDataTo).toBe('2026-11-08');
    expect(coverage.freshness).toBe('stale');
  });

  it('marks an 11-day dataset as partial for a 30-day report', () => {
    const coverage = buildSourceCoverage({
      provider: 'google_analytics',
      period: { start: '2026-10-13', end: '2026-11-11', timezone: 'UTC' },
      dataDates: Array.from({ length: 11 }, (_, index) => `2026-11-${String(index + 1).padStart(2, '0')}`),
      lastSyncAt: '2026-11-11T10:00:00.000Z',
      configured: true,
      connected: true,
      now: NOW,
    });

    expect(coverage.expectedDays).toBe(30);
    expect(coverage.coveredDays).toBe(11);
    expect(coverage.state).toBe('partial');
    expect(coverage.completeness).toBeCloseTo(11 / 30, 4);
  });

  it('represents the Search Console reporting delay explicitly', () => {
    const coverage = buildSourceCoverage({
      provider: 'search_console',
      period,
      dataDates: ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
      lastSyncAt: '2026-11-11T10:00:00.000Z',
      configured: true,
      connected: true,
      reportingDelayDays: 3,
      now: NOW,
    });

    expect(coverage.expectedEnd).toBe('2026-11-08');
    expect(coverage.expectedDays).toBe(4);
    expect(coverage.coveredDays).toBe(4);
    expect(coverage.state).toBe('complete');
    expect(coverage.reportingDelayDays).toBe(3);
  });

  it('does not allow a growth comparison when the previous window is partial', () => {
    const complete = buildSourceCoverage({
      provider: 'google_analytics',
      period,
      dataDates: Array.from({ length: 7 }, (_, index) => `2026-11-${String(index + 5).padStart(2, '0')}`),
      lastSyncAt: '2026-11-11T10:00:00.000Z',
      configured: true,
      connected: true,
      now: NOW,
    });
    const partial = buildSourceCoverage({
      provider: 'google_analytics',
      period: { start: '2026-10-29', end: '2026-11-04', timezone: 'UTC' },
      dataDates: ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'],
      lastSyncAt: '2026-11-11T10:00:00.000Z',
      configured: true,
      connected: true,
      now: NOW,
    });

    expect(coverageIsComparable(complete, partial)).toBe(false);
    expect(coverageIsComparable(complete, { ...complete, provider: 'google_analytics' })).toBe(true);
  });

  it('does not fabricate an expected day count for a future-only window', () => {
    const coverage = buildSourceCoverage({
      provider: 'search_console',
      period: { start: '2026-11-10', end: '2026-11-11', timezone: 'UTC' },
      dataDates: [],
      lastSyncAt: '2026-11-11T10:00:00.000Z',
      configured: true,
      connected: true,
      reportingDelayDays: 3,
      now: NOW,
    });

    expect(coverage.expectedDays).toBe(0);
    expect(coverage.completeness).toBeNull();
    expect(coverage.state).toBe('stale');
  });

  it('computes inclusive calendar days', () => {
    expect(calendarDays('2026-11-05', '2026-11-11')).toBe(7);
    expect(calendarDays('2026-11-11', '2026-11-05')).toBe(0);
  });
});
