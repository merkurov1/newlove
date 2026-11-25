/**
 * The modal heart breathes for exactly 10s: Inhale for the first 4s and
 * Exhale for the remaining 6s. Keeping the phase as a pure function lets the
 * caption read the running CSS animation's own clock instead of a separate
 * interval that could drift.
 */
export const HEART_BREATHING_CYCLE_MS = 10_000;
export const HEART_INHALE_MS = 4_000;

export type HeartBreathingPhase = 'Inhale' | 'Exhale';

export function resolveHeartBreathingPhase(
  elapsedMs: number
): HeartBreathingPhase {
  const phase =
    ((elapsedMs % HEART_BREATHING_CYCLE_MS) + HEART_BREATHING_CYCLE_MS) %
    HEART_BREATHING_CYCLE_MS;

  return phase < HEART_INHALE_MS ? 'Inhale' : 'Exhale';
}
