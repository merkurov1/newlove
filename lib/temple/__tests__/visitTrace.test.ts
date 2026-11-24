import {
  LEFT_WITHOUT_TRACE_KEY,
  consumeLeftWithoutTrace,
  markLeftWithoutTrace,
  ritualTraceThresholdMs,
  shouldRecordRitualTrace,
  visitDurationMinutes,
} from '@/lib/temple/visitTrace';

describe('ritual visit trace threshold', () => {
  const original = process.env.NEXT_PUBLIC_TEMPLE_TRACE_THRESHOLD_MS;

  afterEach(() => {
    window.sessionStorage.clear();

    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_TEMPLE_TRACE_THRESHOLD_MS;
    } else {
      process.env.NEXT_PUBLIC_TEMPLE_TRACE_THRESHOLD_MS = original;
    }
  });

  it('defaults to 60 seconds', () => {
    delete process.env.NEXT_PUBLIC_TEMPLE_TRACE_THRESHOLD_MS;
    expect(ritualTraceThresholdMs()).toBe(60_000);
  });

  it('only records visits at or above the threshold', () => {
    expect(shouldRecordRitualTrace(1_000, 60_999, 60_000)).toBe(false);
    expect(shouldRecordRitualTrace(1_000, 61_000, 60_000)).toBe(true);
    expect(shouldRecordRitualTrace(1_000, 61_000, 120_000)).toBe(false);
    expect(shouldRecordRitualTrace(Number.NaN, 61_000, 60_000)).toBe(false);
  });

  it('formats the persisted duration in whole minutes', () => {
    expect(visitDurationMinutes(1_000, 61_000)).toBe(1);
    expect(visitDurationMinutes(1_000, 121_000)).toBe(2);
  });

  it('shows the left-without-a-trace notice exactly once', () => {
    expect(consumeLeftWithoutTrace()).toBe(false);

    markLeftWithoutTrace();

    expect(window.sessionStorage.getItem(LEFT_WITHOUT_TRACE_KEY)).toBeTruthy();
    expect(consumeLeftWithoutTrace()).toBe(true);
    expect(consumeLeftWithoutTrace()).toBe(false);
  });
});
