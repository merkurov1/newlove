import { VIGIL_COOLDOWN_MS } from '@/lib/vigil/cooldown';

/**
 * The public flame and the private spark cooldown are two separate clocks.
 *
 * - `last_lit_at` on `vigil_hearts` describes the shared Temple flame.
 * - A visitor's personal 24h cooldown lives in `vigil_spark_claims` and must
 *   only ever be read through the server claim endpoint.
 */
export function globalFlameRemainingMs(
  lastLitAt: string | null | undefined,
  nowMs: number = Date.now()
): number {
  if (!lastLitAt) return 0;

  const lastLit = new Date(lastLitAt).getTime();

  if (!Number.isFinite(lastLit)) return 0;

  const remaining = lastLit + VIGIL_COOLDOWN_MS - nowMs;

  return Math.max(0, Math.min(VIGIL_COOLDOWN_MS, remaining));
}

export function isGlobalFlameLit(
  lastLitAt: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  return globalFlameRemainingMs(lastLitAt, nowMs) > 0;
}

export function formatGlobalFlameRemaining(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return 'FLAME EXTINGUISHED';
  }

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }

  return `${Math.max(1, minutes)}m remaining`;
}

/**
 * Heart heat is zero when the shared flame is out. A guardian count can never
 * keep a dead flame glowing, which is what previously made the timer and the
 * artwork disagree.
 */
export function vigilHeartHeat(
  flameLit: boolean,
  guardianCount: number
): number {
  if (!flameLit) return 0;

  const safeCount = Number.isFinite(guardianCount)
    ? Math.floor(guardianCount)
    : 0;

  return Math.min(10, Math.max(1, safeCount));
}
