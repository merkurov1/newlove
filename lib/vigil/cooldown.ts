export const VIGIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const VIGIL_COOLDOWN_SECONDS = VIGIL_COOLDOWN_MS / 1000;

/**
 * Milliseconds remaining before a spark is allowed again.
 * Invalid or future timestamps never produce a negative or infinite wait.
 */
export function vigilCooldownRemainingMs(
  lastSparkAt: string | null | undefined,
  nowMs: number = Date.now()
): number {
  if (!lastSparkAt) return 0;

  const last = new Date(lastSparkAt).getTime();

  if (!Number.isFinite(last)) return 0;

  const remaining = last + VIGIL_COOLDOWN_MS - nowMs;

  return Math.max(0, Math.min(VIGIL_COOLDOWN_MS, remaining));
}

/** Human label used by both the API response and the Vigil interface. */
export function formatVigilCooldown(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '';

  const totalMinutes = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${Math.max(1, minutes)}m`;
}

export function vigilCooldownMessage(remainingMs: number): string {
  const label = formatVigilCooldown(remainingMs);

  return label
    ? `You can light the heart again in ${label}.`
    : 'You can light the heart again now.';
}
