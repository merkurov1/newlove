import { VIGIL_COOLDOWN_MS } from '@/lib/vigil/cooldown';
import {
  parseVigilMetrics,
  type VigilMetrics,
} from '@/lib/vigil/analytics';

/**
 * The public Vigil state is derived only from server-owned rows:
 * - `vigil_spark_claims.last_spark_at` identifies real supporters in the
 *   rolling 24h window;
 * - `vigil_hearts.last_lit_at` describes the shared flame.
 *
 * Aggregate lifetime metrics are appended from the private claim table, never
 * from a client count or a display name. The browser only renders the response.
 */
export const VIGIL_SUPPORTER_WINDOW_MS = VIGIL_COOLDOWN_MS;
export const VIGIL_CROWD_MAX_INTENSITY = 1;
/** Supporter count that saturates the crowd glow; larger crowds are clamped. */
export const VIGIL_CROWD_MAX_SUPPORTERS = 10;
/** Lowest crowd contribution, reached by a single supporter. */
export const VIGIL_CROWD_MIN_INTENSITY = 0.25;

export type VigilPublicState = VigilMetrics & {
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
 * Zero supporters adds no crowd glow. The logarithmic curve spans the
 * meaningful 1..10 supporter range: one supporter already produces the
 * minimum visible glow, every additional supporter is distinguishable, and
 * ten supporters reach full intensity. Larger counts are clamped so a big
 * crowd can never blow out the heart.
 *
 * This is only one input to the shared flame calculation in
 * `lib/vigil/flame.ts`; it never decides whether the flame is lit.
 */
export function vigilCrowdIntensity(count: unknown): number {
  const supporters = normalizeSupporterCount(count);

  if (supporters === 0) return 0;

  // Normalize log10(1..10) onto 0..1; counts above the maximum clamp to 1.
  const normalized = Math.min(
    1,
    Math.log10(supporters) / Math.log10(VIGIL_CROWD_MAX_SUPPORTERS)
  );

  return (
    VIGIL_CROWD_MIN_INTENSITY +
    (VIGIL_CROWD_MAX_INTENSITY - VIGIL_CROWD_MIN_INTENSITY) * normalized
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
    ...parseVigilMetrics(payload),
  };
}
