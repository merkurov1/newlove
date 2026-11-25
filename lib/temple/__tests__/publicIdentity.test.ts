import {
  TEMPLE_PUBLIC_IDENTITY_KEY,
  readPublicIdentityPreference,
  writePublicIdentityPreference,
} from '@/lib/temple/publicIdentity';

describe('public identity preference', () => {
  beforeEach(() => window.localStorage.clear());

  it('is off by default', () => {
    expect(readPublicIdentityPreference(window.localStorage)).toBe(false);
  });

  it('turns on only after an explicit write and can be turned off again', () => {
    writePublicIdentityPreference(true, window.localStorage);

    expect(window.localStorage.getItem(TEMPLE_PUBLIC_IDENTITY_KEY)).toBe(
      'true'
    );
    expect(readPublicIdentityPreference(window.localStorage)).toBe(true);

    writePublicIdentityPreference(false, window.localStorage);

    expect(window.localStorage.getItem(TEMPLE_PUBLIC_IDENTITY_KEY)).toBeNull();
    expect(readPublicIdentityPreference(window.localStorage)).toBe(false);
  });

  it('fails closed when storage is unavailable', () => {
    const brokenStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };

    expect(readPublicIdentityPreference(brokenStorage)).toBe(false);
    expect(() =>
      writePublicIdentityPreference(true, brokenStorage)
    ).not.toThrow();
  });
});
