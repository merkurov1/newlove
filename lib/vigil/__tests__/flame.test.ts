import {
  VIGIL_FLAME_BASE_INTENSITY,
  VIGIL_FLAME_WINDOW_MS,
  computeVigilFlameVisuals,
  formatGlobalFlameRemaining,
  globalFlameExpiresAt,
  globalFlameRemainingMs,
  isGlobalFlameLit,
  resolveVigilFlame,
  vigilFlameRemainingFromExpiry,
  vigilTemporalFade,
  type VigilFlameSnapshot,
} from '@/lib/vigil/flame';
import { VIGIL_COOLDOWN_MS } from '@/lib/vigil/cooldown';

const NOW = new Date('2026-11-24T12:00:00.000Z').getTime();
const HOUR = 60 * 60 * 1000;

function snapshot(
  overrides: Partial<VigilFlameSnapshot> = {}
): VigilFlameSnapshot {
  return {
    flameLit: false,
    lastLitAt: null,
    flameExpiresAt: null,
    supporterCount: 0,
    ...overrides,
  };
}

function litSnapshot(
  elapsedMs: number,
  supporterCount: number,
  overrides: Partial<VigilFlameSnapshot> = {}
): VigilFlameSnapshot {
  const lastLitAt = new Date(NOW - elapsedMs).toISOString();

  return snapshot({
    flameLit: true,
    lastLitAt,
    flameExpiresAt: globalFlameExpiresAt(lastLitAt),
    supporterCount,
    ...overrides,
  });
}

describe('Vigil shared flame clock', () => {
  it('is extinguished without a spark', () => {
    expect(globalFlameExpiresAt(null)).toBeNull();
    expect(globalFlameRemainingMs(null, NOW)).toBe(0);
    expect(isGlobalFlameLit(null, NOW)).toBe(false);
    expect(formatGlobalFlameRemaining(0)).toBe('FLAME EXTINGUISHED');
  });

  it('expires exactly 24 hours after the latest accepted spark', () => {
    const lastLitAt = new Date(NOW - 23 * HOUR).toISOString();
    const expiresAt = globalFlameExpiresAt(lastLitAt);

    expect(expiresAt).toBe(new Date(NOW + HOUR).toISOString());
    expect(globalFlameRemainingMs(lastLitAt, NOW)).toBe(HOUR);
    expect(vigilFlameRemainingFromExpiry(expiresAt, NOW)).toBe(HOUR);
    expect(isGlobalFlameLit(lastLitAt, NOW)).toBe(true);
    expect(formatGlobalFlameRemaining(HOUR)).toBe('1h 0m remaining');
  });

  it('extinguishes exactly at the end of the shared clock', () => {
    const lastLitAt = new Date(NOW - VIGIL_FLAME_WINDOW_MS).toISOString();

    expect(globalFlameRemainingMs(lastLitAt, NOW)).toBe(0);
    expect(isGlobalFlameLit(lastLitAt, NOW)).toBe(false);
  });

  it('clamps invalid or out-of-range expiries', () => {
    expect(vigilFlameRemainingFromExpiry(null, NOW)).toBe(0);
    expect(vigilFlameRemainingFromExpiry('not-a-date', NOW)).toBe(0);
    expect(
      vigilFlameRemainingFromExpiry(
        new Date(NOW + 48 * HOUR).toISOString(),
        NOW
      )
    ).toBe(VIGIL_COOLDOWN_MS);
  });
});

describe('Vigil temporal fade', () => {
  it('runs from 1 at a fresh spark to 0 at expiry', () => {
    expect(vigilTemporalFade(VIGIL_FLAME_WINDOW_MS)).toBe(1);
    expect(vigilTemporalFade(VIGIL_FLAME_WINDOW_MS / 2)).toBe(0.5);
    expect(vigilTemporalFade(0)).toBe(0);
    expect(vigilTemporalFade(-1)).toBe(0);
    expect(vigilTemporalFade(Number.NaN)).toBe(0);
  });

  it('decays monotonically as the deadline approaches', () => {
    const samples = [
      VIGIL_FLAME_WINDOW_MS,
      20 * HOUR,
      12 * HOUR,
      6 * HOUR,
      HOUR,
      60_000,
      0,
    ].map((remaining) => vigilTemporalFade(remaining));

    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]).toBeLessThanOrEqual(samples[index - 1]);
    }
  });

  it('is visibly dimmer near expiry than at the midpoint', () => {
    expect(vigilTemporalFade(HOUR)).toBeLessThan(
      vigilTemporalFade(12 * HOUR)
    );
    expect(vigilTemporalFade(12 * HOUR)).toBeLessThan(
      vigilTemporalFade(VIGIL_FLAME_WINDOW_MS)
    );
  });
});

describe('Vigil shared explicit visual inputs', () => {
  it('produces the same result for the same time, count and lit bit', () => {
    const explicit = computeVigilFlameVisuals({
      flameLit: true,
      remainingMs: 12 * HOUR,
      supporterCount: 24,
    });
    const fromSnapshot = resolveVigilFlame(
      litSnapshot(12 * HOUR, 24),
      NOW
    );

    expect(explicit).toEqual(fromSnapshot);
  });

  it('keeps an expired input completely off regardless of crowd', () => {
    const view = computeVigilFlameVisuals({
      flameLit: true,
      remainingMs: 0,
      supporterCount: 10_000,
    });

    expect(view.active).toBe(false);
    expect(view.temporalFade).toBe(0);
    expect(view.crowdIntensity).toBe(0);
    expect(view.intensity).toBe(0);
  });
});

describe('Vigil shared flame visuals', () => {
  it('is fully off when there is no flame, regardless of supporters', () => {
    const view = resolveVigilFlame(
      snapshot({ flameLit: false, supporterCount: 99 }),
      NOW
    );

    expect(view.active).toBe(false);
    expect(view.remainingMs).toBe(0);
    expect(view.temporalFade).toBe(0);
    expect(view.crowdIntensity).toBe(0);
    expect(view.intensity).toBe(0);
    expect(view.glowOpacity).toBe(0);
    expect(view.glowBlurPx).toBe(0);
  });

  it('shows a freshly lit flame at full temporal strength', () => {
    const view = resolveVigilFlame(litSnapshot(0, 1), NOW);

    expect(view.active).toBe(true);
    expect(view.remainingMs).toBe(VIGIL_FLAME_WINDOW_MS);
    expect(view.temporalFade).toBe(1);
    expect(view.intensity).toBeGreaterThan(0);
    expect(view.glowOpacity).toBe(view.intensity);
    expect(view.remainingLabel).toBe('24h 0m remaining');
  });

  it('dims smoothly at the midpoint and near expiry', () => {
    const justLit = resolveVigilFlame(litSnapshot(0, 12), NOW);
    const midpoint = resolveVigilFlame(litSnapshot(12 * HOUR, 12), NOW);
    const nearExpiry = resolveVigilFlame(
      litSnapshot(VIGIL_FLAME_WINDOW_MS - 60_000, 12),
      NOW
    );

    expect(midpoint.temporalFade).toBe(0.5);
    expect(midpoint.intensity).toBeLessThan(justLit.intensity);
    expect(nearExpiry.active).toBe(true);
    expect(nearExpiry.intensity).toBeGreaterThan(0);
    expect(nearExpiry.intensity).toBeLessThan(midpoint.intensity);
  });

  it('is completely off at expiry even if the server snapshot is stale', () => {
    const stale = litSnapshot(VIGIL_FLAME_WINDOW_MS, 1000);

    const view = resolveVigilFlame(stale, NOW);

    expect(view.active).toBe(false);
    expect(view.intensity).toBe(0);
    expect(view.remainingLabel).toBe('FLAME EXTINGUISHED');
  });

  it('treats the server flameLit bit as authoritative', () => {
    const future = litSnapshot(0, 50, { flameLit: false });

    const view = resolveVigilFlame(future, NOW);

    expect(view.active).toBe(false);
    expect(view.intensity).toBe(0);
  });

  it('keeps a lit flame visible with zero supporters', () => {
    const view = resolveVigilFlame(litSnapshot(0, 0), NOW);

    expect(view.active).toBe(true);
    expect(view.crowdIntensity).toBe(0);
    expect(view.intensity).toBeGreaterThan(0);
    expect(view.intensity).toBeCloseTo(VIGIL_FLAME_BASE_INTENSITY, 6);
  });

  it('adds a bounded crowd contribution as supporters increase', () => {
    const zero = resolveVigilFlame(litSnapshot(0, 0), NOW);
    const one = resolveVigilFlame(litSnapshot(0, 1), NOW);
    const many = resolveVigilFlame(litSnapshot(0, 24), NOW);
    const max = resolveVigilFlame(litSnapshot(0, 100), NOW);
    const clamped = resolveVigilFlame(litSnapshot(0, 1_000_000), NOW);

    expect(one.crowdIntensity).toBeGreaterThan(0);
    expect(one.intensity).toBeGreaterThan(zero.intensity);
    expect(many.intensity).toBeGreaterThan(one.intensity);
    expect(max.intensity).toBeGreaterThan(many.intensity);
    expect(clamped.intensity).toBe(max.intensity);
    expect(max.intensity).toBeLessThanOrEqual(1);
  });

  it('ignores malformed supporter counts without inventing support', () => {
    const malformed = resolveVigilFlame(
      litSnapshot(0, Number.NaN as unknown as number),
      NOW
    );
    const zero = resolveVigilFlame(litSnapshot(0, 0), NOW);

    expect(malformed.crowdIntensity).toBe(0);
    expect(malformed.intensity).toBe(zero.intensity);
  });
});
