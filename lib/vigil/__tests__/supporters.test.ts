import {
  VIGIL_CROWD_MAX_INTENSITY,
  VIGIL_CROWD_MAX_SUPPORTERS,
  VIGIL_CROWD_MIN_INTENSITY,
  normalizeSupporterCount,
  parseVigilPublicState,
  vigilCrowdIntensity,
} from '@/lib/vigil/supporters';

describe('Vigil supporter count to crowd intensity', () => {
  it('adds no crowd glow when nobody is supporting Vigil', () => {
    expect(vigilCrowdIntensity(0)).toBe(0);
  });

  it('gives a lone supporter the minimum visible glow', () => {
    const intensity = vigilCrowdIntensity(1);

    expect(intensity).toBeGreaterThan(0);
    expect(intensity).toBe(VIGIL_CROWD_MIN_INTENSITY);
    expect(intensity).toBeLessThan(vigilCrowdIntensity(2));
  });

  it('increases strictly for every integer count from 1 to 10', () => {
    const samples = Array.from(
      { length: VIGIL_CROWD_MAX_SUPPORTERS },
      (_, index) => vigilCrowdIntensity(index + 1)
    );

    samples.forEach((value, index) => {
      expect(value).toBeGreaterThan(index === 0 ? 0 : samples[index - 1]);
      expect(value).toBeLessThanOrEqual(VIGIL_CROWD_MAX_INTENSITY);
    });

    expect(samples[0]).toBe(VIGIL_CROWD_MIN_INTENSITY);
    expect(samples[samples.length - 1]).toBe(VIGIL_CROWD_MAX_INTENSITY);
  });

  it('reaches full intensity at ten supporters and clamps larger crowds', () => {
    expect(vigilCrowdIntensity(VIGIL_CROWD_MAX_SUPPORTERS)).toBe(
      VIGIL_CROWD_MAX_INTENSITY
    );

    for (const count of [11, 12, 24, 90, 100, 1_000_000]) {
      expect(vigilCrowdIntensity(count)).toBe(VIGIL_CROWD_MAX_INTENSITY);
    }
  });

  it('treats malformed, negative and non-numeric counts as no support', () => {
    expect(vigilCrowdIntensity(-20)).toBe(0);
    expect(vigilCrowdIntensity(Number.NaN)).toBe(0);
    expect(vigilCrowdIntensity(Number.POSITIVE_INFINITY)).toBe(0);
    expect(vigilCrowdIntensity(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(vigilCrowdIntensity(undefined)).toBe(0);
    expect(vigilCrowdIntensity(null)).toBe(0);
    expect(vigilCrowdIntensity('not-a-count')).toBe(0);
    expect(vigilCrowdIntensity(0.9)).toBe(0);
  });

  it('normalizes fractional supporter rows without inventing support', () => {
    expect(normalizeSupporterCount('12.9')).toBe(12);
    expect(vigilCrowdIntensity(2.9)).toBe(vigilCrowdIntensity(2));
  });
});

describe('Vigil public state payload', () => {
  const valid = {
    supporterCount: 7,
    lastLitAt: '2026-11-24T12:00:00.000Z',
    flameExpiresAt: '2026-11-25T12:00:00.000Z',
    flameLit: true,
    windowStartedAt: '2026-11-23T12:00:00.000Z',
    updatedAt: '2026-11-24T12:00:01.000Z',
    lifetimeTotal: 42,
    uniqueParticipants: 20,
    returningParticipants: 5,
    repeatRate: 0.25,
    telegramParticipants: 12,
    supabaseParticipants: 8,
    analyticsSince: '2026-11-16T00:00:00.000Z',
    analyticsAvailable: true,
  };

  it('accepts only a complete server snapshot', () => {
    expect(parseVigilPublicState(valid)).toEqual(valid);
    expect(
      parseVigilPublicState({
        ...valid,
        lastLitAt: null,
        flameExpiresAt: null,
        flameLit: false,
      })
    ).toMatchObject({ lastLitAt: null, flameExpiresAt: null, flameLit: false });
  });

  it('keeps legacy payloads working without inventing analytics', () => {
    const legacy = {
      supporterCount: 7,
      lastLitAt: null,
      flameExpiresAt: null,
      flameLit: false,
      windowStartedAt: '2026-11-23T12:00:00.000Z',
      updatedAt: '2026-11-24T12:00:01.000Z',
    };

    expect(parseVigilPublicState(legacy)).toMatchObject({
      supporterCount: 7,
      lifetimeTotal: null,
      uniqueParticipants: 0,
      returningParticipants: 0,
      repeatRate: null,
      analyticsAvailable: false,
    });
  });

  it('rejects missing, negative or fabricated counts', () => {
    expect(parseVigilPublicState(null)).toBeNull();
    expect(parseVigilPublicState({ ...valid, supporterCount: -1 })).toBeNull();
    expect(parseVigilPublicState({ ...valid, supporterCount: '12' })).toBeNull();
    expect(parseVigilPublicState({ ...valid, flameLit: 'yes' })).toBeNull();
    expect(parseVigilPublicState({ ...valid, updatedAt: undefined })).toBeNull();
  });

  it('requires an explicit shared expiry, including null when never lit', () => {
    expect(
      parseVigilPublicState({ ...valid, flameExpiresAt: undefined })
    ).toBeNull();
    expect(
      parseVigilPublicState({ ...valid, flameExpiresAt: 123 })
    ).toBeNull();
  });
});
