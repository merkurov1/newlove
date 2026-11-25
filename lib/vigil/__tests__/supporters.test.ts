import {
  normalizeSupporterCount,
  parseVigilPublicState,
  vigilCrowdIntensity,
} from '@/lib/vigil/supporters';

describe('Vigil supporter count to crowd intensity', () => {
  it('adds no crowd glow when nobody is supporting Vigil', () => {
    expect(vigilCrowdIntensity(0)).toBe(0);
  });

  it('shows a visible, modest increase for a low real count', () => {
    const intensity = vigilCrowdIntensity(1);

    expect(intensity).toBeGreaterThan(0);
    expect(intensity).toBeLessThan(vigilCrowdIntensity(10));
  });

  it('grows for typical and high supporter counts', () => {
    const zero = vigilCrowdIntensity(0);
    const low = vigilCrowdIntensity(3);
    const typical = vigilCrowdIntensity(24);
    const high = vigilCrowdIntensity(90);

    expect(low).toBeGreaterThan(zero);
    expect(typical).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(typical);
    expect(high).toBeLessThanOrEqual(1);
  });

  it('clamps very large or malformed counts without inventing support', () => {
    expect(vigilCrowdIntensity(100)).toBe(1);
    expect(vigilCrowdIntensity(1_000_000)).toBe(1);
    expect(vigilCrowdIntensity(-20)).toBe(0);
    expect(vigilCrowdIntensity(Number.NaN)).toBe(0);
    expect(vigilCrowdIntensity(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeSupporterCount('12.9')).toBe(12);
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
