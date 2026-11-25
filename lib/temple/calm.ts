/**
 * Keep Calm is a timed ritual, not a page view. The same threshold is used by
 * the scene (to decide when the ritual is complete) and by the public trace
 * endpoint (to reject an early-exit signal). Keeping it in one framework-free
 * module prevents the UI and server from drifting apart.
 */
export const CALM_COMPLETION_THRESHOLD_SECONDS = 30;
export const CALM_COMPLETION_THRESHOLD_MS = CALM_COMPLETION_THRESHOLD_SECONDS * 1000;

export function isCalmRitualComplete(seconds: number): boolean {
  return Number.isFinite(seconds) && seconds >= CALM_COMPLETION_THRESHOLD_SECONDS;
}

export function calmCompletionMessage(seconds: number): string {
  const safeSeconds = Math.max(
    CALM_COMPLETION_THRESHOLD_SECONDS,
    Math.floor(Number.isFinite(seconds) ? seconds : CALM_COMPLETION_THRESHOLD_SECONDS)
  );

  return `Completed ${safeSeconds} seconds of calm.`;
}
