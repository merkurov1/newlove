import { VIGIL_COOLDOWN_MS } from '@/lib/vigil/cooldown';

/**
 * The public Vigil state is derived only from server-owned rows:
 * - `vigil_spark_claims.last_spark_at` identifies real supporters in the
 *   rolling 24h window;
 * - `vigil_hearts.last_lit_at` describes the shared flame.
 *
 * The browser never supplies the count. It only renders the server response.
 */
export const VIGIL_SUPPORTER_WINDOW_MS = VIGIL_COOLDOWN_MS;
export const VIGIL_CROWD_MAX_INTENSITY = 1;

export type VigilPublicState = {
  supporterCount: number;
  lastLitAt: string | null;
  /** Server-computed shared expiry: lastLitAt + 24h, ISO epoch. */
  flameExpiresAt: string | null;
  flameLit: boolean;
  windowStartedAt: string;
  updatedAt: string;
};

export function normalizeSupporterCount(value: unknown): number {
  const count = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(count) || count <= 0) return 0;

  return Math.floor(count);
}

/**
 * Maps the live supporter count to a bounded 0..1 crowd contribution.
 *
 * Zero supporters adds no crowd glow. The logarithmic curve makes small, real
 * increases visible (1 → ~0.36) without letting a large crowd blow out the
 * heart; 100 supporters reaches full intensity and larger counts are clamped.
 *
 * This is only one input to the shared flame calculation in
 * `lib/vigil/flame.ts`; it never decides whether the flame is lit.
 */
export function vigilCrowdIntensity(count: unknown): number {
  const supporters = normalizeSupporterCount(count);

  if (supporters === 0) return 0;

  const normalized =
    Math.log10(supporters + 1) / Math.log10(101);

  return Math.min(
    VIGIL_CROWD_MAX_INTENSITY,
    Math.max(0.25, 0.25 + normalized * 0.75)
  );
}

function optionalTimestamp(value: unknown): string | null | undefined {
  if (value === null) return null;

  return typeof value === 'string' ? value : undefined;
}

/**
 * Validates the server payload before it can reach the artwork. Invalid or
 * partial responses are rejected so the UI keeps its last known real state
 * instead of substituting a made-up count or expiry.
 */
export function parseVigilPublicState(
  value: unknown
): VigilPublicState | null {
  if (!value || typeof value !== 'object') return null;

  const payload = value as Record<string, unknown>;
  const supporterCount = payload.supporterCount;

  if (
    typeof supporterCount !== 'number' ||
    !Number.isFinite(supporterCount) ||
    supporterCount < 0
  ) {
    return null;
  }

  const lastLitAt = optionalTimestamp(payload.lastLitAt);
  const flameExpiresAt = optionalTimestamp(payload.flameExpiresAt);

  if (lastLitAt === undefined) return null;
  if (flameExpiresAt === undefined) return null;

  if (typeof payload.flameLit !== 'boolean') return null;
  if (typeof payload.windowStartedAt !== 'string') return null;
  if (typeof payload.updatedAt !== 'string') return null;

  return {
    supporterCount: normalizeSupporterCount(supporterCount),
    lastLitAt,
    flameExpiresAt,
    flameLit: payload.flameLit,
    windowStartedAt: payload.windowStartedAt,
    updatedAt: payload.updatedAt,
  };
}
