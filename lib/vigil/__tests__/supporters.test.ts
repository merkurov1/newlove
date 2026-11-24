import {
  normalizeSupporterCount,
  parseVigilPublicState,
  vigilHeartIntensity,
  vigilHeartVisuals,
} from '@/lib/vigil/supporters';

describe('Vigil supporter count to heart intensity', () => {
  it('turns the heart dark when nobody is supporting Vigil', () => {
    expect(vigilHeartIntensity(0)).toBe(0);
    expect(vigilHeartVisuals(0)).toMatchObject({
      intensity: 0,
      glowOpacity: 0,
      glowBlurPx: 0,
      grayscale: 0.94,
    });
  });

  it('shows a visible, modest increase for a low real count', () => {
    const intensity = vigilHeartIntensity(1);

    expect(intensity).toBeGreaterThan(0);
    expect(intensity).toBeLessThan(vigilHeartIntensity(10));
  });

  it('grows for typical and high supporter counts', () => {
    const zero = vigilHeartIntensity(0);
    const low = vigilHeartIntensity(3);
    const typical = vigilHeartIntensity(24);
    const high = vigilHeartIntensity(90);

    expect(low).toBeGreaterThan(zero);
    expect(typical).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(typical);
    expect(high).toBeLessThanOrEqual(1);
  });

  it('clamps very large or malformed counts without inventing support', () => {
    expect(vigilHeartIntensity(100)).toBe(1);
    expect(vigilHeartIntensity(1_000_000)).toBe(1);
    expect(vigilHeartIntensity(-20)).toBe(0);
    expect(vigilHeartIntensity(Number.NaN)).toBe(0);
    expect(vigilHeartIntensity(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeSupporterCount('12.9')).toBe(12);
  });

  it('keeps brightness, saturation and scale tied to the same intensity', () => {
    const dark = vigilHeartVisuals(0);
    const bright = vigilHeartVisuals(100);

    expect(bright.intensity).toBeGreaterThan(dark.intensity);
    expect(bright.brightness).toBeGreaterThan(dark.brightness);
    expect(bright.saturate).toBeGreaterThan(dark.saturate);
    expect(bright.grayscale).toBeLessThan(dark.grayscale);
    expect(bright.glowBlurPx).toBeGreaterThan(dark.glowBlurPx);
  });
});

describe('Vigil public state payload', () => {
  const valid = {
    supporterCount: 7,
    lastLitAt: '2026-11-24T12:00:00.000Z',
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
        flameLit: false,
      })
    ).toMatchObject({ lastLitAt: null, flameLit: false });
  });

  it('rejects missing, negative or fabricated counts', () => {
    expect(parseVigilPublicState(null)).toBeNull();
    expect(parseVigilPublicState({ ...valid, supporterCount: -1 })).toBeNull();
    expect(parseVigilPublicState({ ...valid, supporterCount: '12' })).toBeNull();
    expect(parseVigilPublicState({ ...valid, flameLit: 'yes' })).toBeNull();
    expect(parseVigilPublicState({ ...valid, updatedAt: undefined })).toBeNull();
  });
});
