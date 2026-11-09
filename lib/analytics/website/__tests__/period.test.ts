/** @jest-environment node */

import { periodForPreset, resolveWebsitePeriod } from '../period';

const NOW = new Date('2026-11-09T12:00:00.000Z');

describe('website analytics periods', () => {
  it('uses inclusive calendar days in the reporting timezone', () => {
    const period = resolveWebsitePeriod({
      periodKey: 'last_7_days',
      timezone: 'Europe/London',
      now: NOW,
      language: 'ru',
    });

    expect(period.start).toBe('2026-11-03');
    expect(period.end).toBe('2026-11-09');
    expect(period.previousStart).toBe('2026-10-27');
    expect(period.previousEnd).toBe('2026-11-02');
    expect(period.comparisonRequested).toBe(true);
  });

  it('supports a previous calendar month', () => {
    const period = resolveWebsitePeriod({
      periodKey: 'previous_month',
      timezone: 'Europe/London',
      now: NOW,
      language: 'ru',
    });

    expect(period.start).toBe('2026-10-01');
    expect(period.end).toBe('2026-10-31');
    expect(period.previousStart).toBe('2026-09-01');
    expect(period.previousEnd).toBe('2026-09-30');
  });

  it('supports 30 and 90 day presets', () => {
    const thirty = periodForPreset(30, 'Europe/London', NOW);
    expect(thirty.start).toBe('2026-10-11');
    expect(thirty.end).toBe('2026-11-09');

    const ninety = periodForPreset(90, 'Europe/London', NOW);
    expect(ninety.start).toBe('2026-08-12');
    expect(ninety.end).toBe('2026-11-09');
  });
});
