/** @jest-environment node */

import {
  openSecret,
  sealSecret,
  signState,
  verifyState,
} from '../tokenCrypto';

describe('analytics token protection', () => {
  it('seals and opens a refresh token without storing plaintext', () => {
    const token = '1//0g-example-refresh-token-value';
    const sealed = sealSecret(token);

    expect(sealed.ciphertext).not.toContain(token);
    expect(sealed.iv).toBeTruthy();
    expect(sealed.tag).toBeTruthy();
    expect(openSecret(sealed)).toBe(token);
  });

  it('returns null for a tampered token instead of throwing', () => {
    const sealed = sealSecret('refresh-token');
    const tampered = {
      ...sealed,
      ciphertext: Buffer.from('tampered').toString('base64'),
    };

    expect(openSecret(tampered)).toBeNull();
    expect(openSecret({ ...sealed, tag: Buffer.alloc(16).toString('base64') })).toBeNull();
  });

  it('opens a token sealed with the derived key after a dedicated key is configured', () => {
    const originalDedicated = process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY;
    const originalPrevious = process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS;

    try {
      delete process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY;
      delete process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS;
      const sealed = sealSecret('legacy-refresh-token');
      expect(sealed.keyVersion).toBe('v1:derived-service-role');

      process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY = 'new-dedicated-key';
      expect(openSecret(sealed)).toBe('legacy-refresh-token');
    } finally {
      if (originalDedicated === undefined) delete process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY;
      else process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY = originalDedicated;
      if (originalPrevious === undefined) {
        delete process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS;
      } else {
        process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS = originalPrevious;
      }
    }
  });

  it('opens a legacy token that has no stored key version', () => {
    const originalDedicated = process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY;

    try {
      delete process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY;
      const sealed = sealSecret('legacy-unversioned-token');
      const { keyVersion: _keyVersion, ...legacy } = sealed;

      process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY = 'new-dedicated-key';
      expect(openSecret(legacy)).toBe('legacy-unversioned-token');
    } finally {
      if (originalDedicated === undefined) delete process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY;
      else process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY = originalDedicated;
    }
  });

  it('opens a token with an explicitly retired previous dedicated key', () => {
    const originalDedicated = process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY;
    const originalPrevious = process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS;

    try {
      process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY = 'old-dedicated-key';
      const sealed = sealSecret('rotating-refresh-token');

      process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY = 'new-dedicated-key';
      process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS = 'old-dedicated-key';
      expect(openSecret(sealed)).toBe('rotating-refresh-token');
    } finally {
      if (originalDedicated === undefined) delete process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY;
      else process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY = originalDedicated;
      if (originalPrevious === undefined) {
        delete process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS;
      } else {
        process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS = originalPrevious;
      }
    }
  });

  it('still returns null when no candidate key can authenticate the token', () => {
    const originalDedicated = process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY;
    const originalPrevious = process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS;

    try {
      process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY = 'key-that-sealed-it';
      const sealed = sealSecret('never-readable');

      process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY = 'different-key';
      delete process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS;
      expect(openSecret(sealed)).toBeNull();
    } finally {
      if (originalDedicated === undefined) delete process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY;
      else process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY = originalDedicated;
      if (originalPrevious === undefined) {
        delete process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS;
      } else {
        process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS = originalPrevious;
      }
    }
  });

  it('returns null instead of throwing when no encryption key is configured', () => {
    const originalDedicated = process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY;
    const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      delete process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      expect(
        openSecret({ ciphertext: 'cipher', iv: 'iv', tag: 'tag', keyVersion: 'v1:derived' })
      ).toBeNull();
    } finally {
      if (originalDedicated === undefined) delete process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY;
      else process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY = originalDedicated;
      if (originalServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
    }
  });

  it('signs and verifies OAuth state', () => {
    const payload = { uid: 'admin-1', nonce: 'n', exp: Date.now() + 60_000 };
    const state = signState(payload, 'test-secret');

    expect(verifyState<typeof payload>(state, 'test-secret')).toMatchObject(payload);
    expect(verifyState(state, 'wrong-secret')).toBeNull();
    expect(verifyState(`${state}x`, 'test-secret')).toBeNull();
  });
});
