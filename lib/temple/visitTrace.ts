/**
 * A ritual visit only leaves a Temple trace when it lasted long enough to be a
 * real visit rather than an accidental tap. The threshold is configurable for
 * staging and defaults to 60 seconds.
 */
export const LEFT_WITHOUT_TRACE_KEY = 'temple:left-without-trace';

export function ritualTraceThresholdMs(): number {
  const configured = Number(
    process.env.NEXT_PUBLIC_TEMPLE_TRACE_THRESHOLD_MS
  );

  return Number.isFinite(configured) && configured > 0
    ? configured
    : 60_000;
}

export function shouldRecordRitualTrace(
  startedAtMs: number,
  endedAtMs: number = Date.now(),
  thresholdMs: number = ritualTraceThresholdMs()
): boolean {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) {
    return false;
  }

  return endedAtMs - startedAtMs >= thresholdMs;
}

export function visitDurationMinutes(
  startedAtMs: number,
  endedAtMs: number = Date.now()
): number {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) {
    return 0;
  }

  return Math.max(0, Math.ceil((endedAtMs - startedAtMs) / 60_000));
}

export function markLeftWithoutTrace(): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(
      LEFT_WITHOUT_TRACE_KEY,
      String(Date.now())
    );
  } catch {
    // Storage can be unavailable in private webviews. The ritual still closes.
  }
}

/** Reads and clears the one-shot notice shown back on the Temple page. */
export function consumeLeftWithoutTrace(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const value = window.sessionStorage.getItem(LEFT_WITHOUT_TRACE_KEY);

    if (!value) return false;

    window.sessionStorage.removeItem(LEFT_WITHOUT_TRACE_KEY);

    return true;
  } catch {
    return false;
  }
}
