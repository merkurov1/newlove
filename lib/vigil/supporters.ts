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
export const VIGIL_HEART_MAX_INTENSITY = 1;

export type VigilPublicState = {
  supporterCount: number;
  lastLitAt: string | null;
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
 * Maps the live supporter count to a 0..1 artwork intensity.
 *
 * Zero supporters means no glow. The logarithmic curve makes small, real
 * increases visible (1 → ~0.36) without letting a large crowd blow out the
 * heart; 100 supporters reaches full intensity and larger counts are clamped.
 */
export function vigilHeartIntensity(count: unknown): number {
  const supporters = normalizeSupporterCount(count);

  if (supporters === 0) return 0;

  const normalized =
    Math.log10(supporters + 1) / Math.log10(101);

  return Math.min(
    VIGIL_HEART_MAX_INTENSITY,
    Math.max(0.25, 0.25 + normalized * 0.75)
  );
}

export type VigilHeartVisuals = {
  intensity: number;
  brightness: number;
  grayscale: number;
  saturate: number;
  glowOpacity: number;
  glowBlurPx: number;
  scale: number;
};

/** Pure visual tokens so the heart is testable without a browser. */
export function vigilHeartVisuals(count: unknown): VigilHeartVisuals {
  const intensity = vigilHeartIntensity(count);

  return {
    intensity,
    brightness: 0.68 + intensity * 0.62,
    grayscale: Math.max(0, 0.94 - intensity * 0.94),
    saturate: 0.55 + intensity * 1.1,
    glowOpacity: intensity,
    glowBlurPx: intensity === 0 ? 0 : 18 + Math.round(intensity * 46),
    scale: 1 + intensity * 0.06,
  };
}

/**
 * Validates the server payload before it can reach the artwork. Invalid or
 * partial responses are rejected so the UI keeps its last known real state
 * instead of substituting a made-up count.
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

  const lastLitAt =
    payload.lastLitAt === null
      ? null
      : typeof payload.lastLitAt === 'string'
        ? payload.lastLitAt
        : undefined;

  if (lastLitAt === undefined) return null;

  if (typeof payload.flameLit !== 'boolean') return null;
  if (typeof payload.windowStartedAt !== 'string') return null;
  if (typeof payload.updatedAt !== 'string') return null;

  return {
    supporterCount: normalizeSupporterCount(supporterCount),
    lastLitAt,
    flameLit: payload.flameLit,
    windowStartedAt: payload.windowStartedAt,
    updatedAt: payload.updatedAt,
  };
}
