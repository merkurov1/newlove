import { VIGIL_COOLDOWN_MS } from '@/lib/vigil/cooldown';
import { vigilCrowdIntensity } from '@/lib/vigil/supporters';

/**
 * The public flame and the private spark cooldown are two separate clocks.
 *
 * - `last_lit_at` on `vigil_hearts` describes the shared Temple flame.
 * - A visitor's personal 24h cooldown lives in `vigil_spark_claims` and must
 *   only ever be read through the server claim endpoint.
 *
 * Both surfaces (the Temple home heart and `/vigil`) must render this one
 * calculation. The inputs are deliberately separate so a stale display list
 * can never make an extinguished flame glow.
 */
export const VIGIL_FLAME_WINDOW_MS = VIGIL_COOLDOWN_MS;

/**
 * Even a lone spark keeps a visible base glow while the shared flame is lit.
 * The supporter count then adds a bounded, logarithmic crowd contribution.
 */
export const VIGIL_FLAME_BASE_INTENSITY = 0.35;

export type VigilFlameSnapshot = {
  /** Authoritative server state from /api/vigil/state. */
  flameLit: boolean;
  lastLitAt: string | null;
  flameExpiresAt?: string | null;
  /** Authoritative unique supporters in the rolling 24h window. */
  supporterCount: number;
};

export type VigilFlameView = {
  active: boolean;
  remainingMs: number;
  remainingLabel: string;
  /** Smooth 0..1 decay towards the shared expiry. */
  temporalFade: number;
  /** Bounded 0..1 crowd contribution from unique supporters. */
  crowdIntensity: number;
  /** Combined 0..1 artwork intensity; always 0 when the flame is not lit. */
  intensity: number;
  brightness: number;
  grayscale: number;
  saturate: number;
  glowOpacity: number;
  glowBlurPx: number;
  scale: number;
};

/** Explicit, independently testable inputs for the shared artwork. */
export type VigilFlameVisualInputs = {
  /** Authoritative server flame state. */
  flameLit: boolean;
  /** Milliseconds until the shared expiry; 0 means expired. */
  remainingMs: number;
  /** Authoritative unique supporters in the rolling 24h window. */
  supporterCount: number;
};

/** ISO expiry for the shared flame, or null when it has never been lit. */
export function globalFlameExpiresAt(
  lastLitAt: string | null | undefined
): string | null {
  if (!lastLitAt) return null;

  const lastLit = new Date(lastLitAt).getTime();

  if (!Number.isFinite(lastLit)) return null;

  return new Date(lastLit + VIGIL_FLAME_WINDOW_MS).toISOString();
}

/**
 * Milliseconds until the shared flame expires. Accepts the server-provided
 * expiry so the client never has to reconstruct the window from a local
 * clock. Clamped to 0..24h so a clock jump cannot produce an invalid fade.
 */
export function vigilFlameRemainingFromExpiry(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now()
): number {
  if (!expiresAt) return 0;

  const expiry = new Date(expiresAt).getTime();

  if (!Number.isFinite(expiry)) return 0;

  const remaining = expiry - nowMs;

  return Math.max(0, Math.min(VIGIL_FLAME_WINDOW_MS, remaining));
}

export function globalFlameRemainingMs(
  lastLitAt: string | null | undefined,
  nowMs: number = Date.now()
): number {
  return vigilFlameRemainingFromExpiry(
    globalFlameExpiresAt(lastLitAt),
    nowMs
  );
}

export function isGlobalFlameLit(
  lastLitAt: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  return globalFlameRemainingMs(lastLitAt, nowMs) > 0;
}

/**
 * Smooth, deterministic temporal fade: 1 immediately after a spark, 0 at
 * expiry. Smoothstep keeps the curve continuous while remaining strictly
 * monotonic, so the heart only ever dims as the shared deadline approaches.
 */
export function vigilTemporalFade(remainingMs: number): number {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0;

  const fraction = Math.min(
    1,
    remainingMs / VIGIL_FLAME_WINDOW_MS
  );

  if (fraction >= 1) return 1;

  return fraction * fraction * (3 - 2 * fraction);
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

function resolveExpiry(snapshot: VigilFlameSnapshot): string | null {
  const explicit = snapshot.flameExpiresAt;

  if (explicit && Number.isFinite(new Date(explicit).getTime())) {
    return explicit;
  }

  return globalFlameExpiresAt(snapshot.lastLitAt);
}

function visualsFromIntensity(intensity: number): Pick<
  VigilFlameView,
  | 'brightness'
  | 'grayscale'
  | 'saturate'
  | 'glowOpacity'
  | 'glowBlurPx'
  | 'scale'
> {
  const safeIntensity = Number.isFinite(intensity)
    ? Math.min(1, Math.max(0, intensity))
    : 0;

  return {
    brightness: 0.68 + safeIntensity * 0.62,
    grayscale: Math.max(0, 0.94 - safeIntensity * 0.94),
    saturate: 0.55 + safeIntensity * 1.1,
    glowOpacity: safeIntensity,
    glowBlurPx:
      safeIntensity === 0
        ? 0
        : 18 + Math.round(safeIntensity * 46),
    scale: 1 + safeIntensity * 0.06,
  };
}

/**
 * The single shared artwork calculation. Temporal fade, crowd contribution
 * and the authoritative lit bit stay separate inputs, so a dead flame can
 * never be kept glowing by a count and a display list cannot change either.
 */
export function computeVigilFlameVisuals(
  inputs: VigilFlameVisualInputs
): VigilFlameView {
  const remainingMs = Number.isFinite(inputs.remainingMs)
    ? Math.max(
        0,
        Math.min(VIGIL_FLAME_WINDOW_MS, inputs.remainingMs)
      )
    : 0;
  const active = inputs.flameLit === true && remainingMs > 0;
  const temporalFade = active ? vigilTemporalFade(remainingMs) : 0;
  const crowdIntensity = active
    ? vigilCrowdIntensity(inputs.supporterCount)
    : 0;
  const intensity = active
    ? temporalFade *
      (VIGIL_FLAME_BASE_INTENSITY +
        (1 - VIGIL_FLAME_BASE_INTENSITY) * crowdIntensity)
    : 0;

  return {
    active,
    remainingMs: active ? remainingMs : 0,
    remainingLabel: formatGlobalFlameRemaining(
      active ? remainingMs : 0
    ),
    temporalFade,
    crowdIntensity,
    intensity,
    ...visualsFromIntensity(intensity),
  };
}

/**
 * The single shared flame calculation used by the homepage and /vigil.
 *
 * The server's `flameLit` bit is authoritative. Client time is only used to
 * interpolate between two server timestamps, so the artwork fades smoothly
 * and reaches exactly zero at expiry even before the next refresh arrives.
 */
export function resolveVigilFlame(
  snapshot: VigilFlameSnapshot,
  nowMs: number = Date.now()
): VigilFlameView {
  const expiresAt = resolveExpiry(snapshot);

  return computeVigilFlameVisuals({
    flameLit: snapshot.flameLit,
    remainingMs: vigilFlameRemainingFromExpiry(expiresAt, nowMs),
    supporterCount: snapshot.supporterCount,
  });
}
