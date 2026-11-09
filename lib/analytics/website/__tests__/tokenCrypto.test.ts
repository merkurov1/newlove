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

  it('signs and verifies OAuth state', () => {
    const payload = { uid: 'admin-1', nonce: 'n', exp: Date.now() + 60_000 };
    const state = signState(payload, 'test-secret');

    expect(verifyState<typeof payload>(state, 'test-secret')).toMatchObject(payload);
    expect(verifyState(state, 'wrong-secret')).toBeNull();
    expect(verifyState(`${state}x`, 'test-secret')).toBeNull();
  });
});
