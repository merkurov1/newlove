/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { flowDayKey, flowDayMarkers } from '../dayMarker';

describe('Flow day markers', () => {
  it('uses the same UTC calendar boundary as the displayed date', () => {
    expect(flowDayKey('2026-11-27T23:59:59.999Z')).toBe('2026-11-27');
    expect(flowDayKey('2026-11-28T00:00:00.000Z')).toBe('2026-11-28');
    expect(flowDayKey('2026-11-28T01:30:00+03:00')).toBe('2026-11-27');
    expect(flowDayKey('not-a-date')).toBeNull();
    expect(flowDayKey(null)).toBeNull();
  });

  it('marks exactly the first entry of each calendar day', () => {
    const markers = flowDayMarkers([
      { published_at: '2026-11-27T12:00:00.000Z' },
      { published_at: '2026-11-27T09:00:00.000Z' },
      { published_at: '2026-11-26T20:00:00.000Z' },
      { published_at: '2026-11-26T18:00:00.000Z' },
      { published_at: '2026-11-25T08:00:00.000Z' },
    ]);

    expect(markers).toEqual([true, false, true, false, true]);
  });

  it('falls back to created_at and skips undated entries', () => {
    const markers = flowDayMarkers([
      { created_at: '2026-11-27T10:00:00.000Z' },
      { published_at: null, created_at: null },
      { created_at: '2026-11-27T11:00:00.000Z' },
      { created_at: '2026-11-26T11:00:00.000Z' },
    ]);

    expect(markers).toEqual([true, false, false, true]);
  });

  it('never repeats a day when pagination appends an out-of-order page', () => {
    const markers = flowDayMarkers([
      { published_at: '2026-11-27T12:00:00.000Z' },
      { published_at: '2026-11-26T12:00:00.000Z' },
      { published_at: '2026-11-27T08:00:00.000Z' },
    ]);

    expect(markers).toEqual([true, true, false]);
    expect(markers.filter(Boolean)).toHaveLength(2);
  });
});
