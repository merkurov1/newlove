/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import {
  instantViewSessionKeySource,
  openInstantViewSecret,
  sealInstantViewSecret,
} from '../instantViewSessionCrypto';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY = 'instant-view-test-key';
  delete process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY_PREVIOUS;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Telegram Instant View session encryption', () => {
  it('seals a cookie without storing plaintext', () => {
    const cookie = 'iv_session=secret-cookie-value; other=value';
    const sealed = sealInstantViewSecret(cookie);

    expect(sealed.ciphertext).not.toContain(cookie);
    expect(sealed.ciphertext).not.toContain('secret-cookie-value');
    expect(sealed.iv).toBeTruthy();
    expect(sealed.tag).toBeTruthy();
    expect(sealed.keyVersion).toBe('v1:dedicated');
    expect(openInstantViewSecret(sealed)).toBe(cookie);
  });

  it('rejects tampered ciphertext and authentication tags', () => {
    const sealed = sealInstantViewSecret('cookie');

    expect(
      openInstantViewSecret({
        ...sealed,
        ciphertext: Buffer.from('tampered').toString('base64'),
      })
    ).toBeNull();
    expect(
      openInstantViewSecret({ ...sealed, tag: Buffer.alloc(16).toString('base64') })
    ).toBeNull();
  });

  it('uses the server-only service-role key as a derived fallback', () => {
    delete process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-value';

    const sealed = sealInstantViewSecret('derived-cookie');

    expect(sealed.keyVersion).toBe('v1:derived-service-role');
    expect(openInstantViewSecret(sealed)).toBe('derived-cookie');
    expect(instantViewSessionKeySource()).toBe('derived');
  });

  it('opens a previously sealed session after rotating to a dedicated key', () => {
    delete process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-value';
    const sealed = sealInstantViewSecret('legacy-cookie');

    process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY = 'new-dedicated-key';
    expect(openInstantViewSecret(sealed)).toBe('legacy-cookie');
  });

  it('opens a session with an explicitly retired previous key', () => {
    process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY = 'old-key';
    const sealed = sealInstantViewSecret('rotating-cookie');

    process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY = 'new-key';
    process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY_PREVIOUS = 'old-key';

    expect(openInstantViewSecret(sealed)).toBe('rotating-cookie');
  });

  it('fails closed when no server-side key is available', () => {
    delete process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(instantViewSessionKeySource()).toBe('unavailable');
    expect(() => sealInstantViewSecret('cookie')).toThrow(/encryption is unavailable/i);
    expect(
      openInstantViewSecret({
        ciphertext: 'cipher',
        iv: 'iv',
        tag: 'tag',
        keyVersion: 'v1:dedicated',
      })
    ).toBeNull();
  });

  it('reports a dedicated key source without exposing the key', () => {
    expect(instantViewSessionKeySource()).toBe('dedicated');
  });
});
