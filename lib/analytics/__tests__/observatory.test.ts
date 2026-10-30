/** @jest-environment node */

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { parseObservatoryFilters } from '../observatory';

const NOW = new Date('2026-10-30T15:42:00.000Z');

afterEach(() => {
  jest.useRealTimers();
});

function freezeNow() {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
}

describe('parseObservatoryFilters', () => {
  it('defaults to the last 30 days and includes comparison', () => {
    freezeNow();

    const filters = parseObservatoryFilters({});

    expect(filters.preset).toBe('30d');
    expect(filters.from).toBe('2026-10-01T00:00:00.000Z');
    expect(filters.to).toBe(NOW.toISOString());
    expect(filters.compare).toBe(true);
  });

  it('starts today at UTC midnight', () => {
    freezeNow();

    const filters = parseObservatoryFilters({ preset: 'today' });

    expect(filters.from).toBe('2026-10-30T00:00:00.000Z');
  });

  it('supports 7 and 90 day presets', () => {
    freezeNow();

    expect(parseObservatoryFilters({ preset: '7d' }).from).toBe('2026-10-24T00:00:00.000Z');
    expect(parseObservatoryFilters({ preset: '90d' }).from).toBe('2026-08-02T00:00:00.000Z');
  });

  it('honours a valid custom range and expands the end date to end of day', () => {
    freezeNow();

    const filters = parseObservatoryFilters({
      preset: 'custom',
      from: '2026-09-01',
      to: '2026-09-15',
    });

    expect(filters.preset).toBe('custom');
    expect(filters.from).toBe('2026-09-01T00:00:00.000Z');
    expect(filters.to).toBe('2026-09-15T23:59:59.999Z');
  });

  it('falls back to the default range when custom dates are invalid or reversed', () => {
    freezeNow();

    const reversed = parseObservatoryFilters({
      preset: 'custom',
      from: '2026-09-15',
      to: '2026-09-01',
    });

    expect(reversed.from).toBe('2026-10-01T00:00:00.000Z');
    expect(reversed.to).toBe(NOW.toISOString());

    const invalid = parseObservatoryFilters({ preset: 'custom', from: 'not-a-date' });

    expect(invalid.from).toBe('2026-10-01T00:00:00.000Z');
  });

  it('accepts only supported languages and allows comparison to be disabled', () => {
    freezeNow();

    expect(parseObservatoryFilters({ language: 'ru' }).language).toBe('ru');
    expect(parseObservatoryFilters({ language: 'en' }).language).toBe('en');
    expect(parseObservatoryFilters({ language: 'de' }).language).toBeUndefined();
    expect(parseObservatoryFilters({ compare: '0' }).compare).toBe(false);
  });

  it('takes the first value when a search param repeats', () => {
    freezeNow();

    expect(parseObservatoryFilters({ language: ['en', 'ru'] }).language).toBe('en');
  });
});
