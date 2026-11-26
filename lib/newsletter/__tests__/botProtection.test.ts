/** @jest-environment node */

import {
  checkSignupTiming,
  honeypotWasFilled,
  verifyTurnstileToken,
} from '../botProtection';

function response(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe('newsletter bot protection', () => {
  it('accepts a legitimate slow submission and rejects impossibly fast or expired forms', () => {
    const now = 1_800_000_000_000;

    expect(checkSignupTiming(now - 5_000, now)).toEqual({ ok: true, ageMs: 5_000 });
    expect(checkSignupTiming(now - 300, now)).toEqual({ ok: false, reason: 'too_fast' });
    expect(checkSignupTiming(now - 25 * 60 * 60 * 1000, now)).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(checkSignupTiming(undefined, now)).toEqual({ ok: false, reason: 'missing' });
  });

  it('detects only a non-empty honeypot', () => {
    expect(honeypotWasFilled('', '   ', undefined)).toBe(false);
    expect(honeypotWasFilled('', 'spam')).toBe(true);
  });

  it('skips Turnstile outside production when no secret is configured', async () => {
    const result = await verifyTurnstileToken({ token: '', secretKey: '' });
    expect(result).toEqual({ ok: true, skipped: true });
  });

  it('fails closed in production when the secret is missing', async () => {
    const result = await verifyTurnstileToken({
      token: 'token',
      secretKey: '',
      requireConfigured: true,
    });

    expect(result).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('treats NODE_ENV=production as a fail-closed runtime', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSecret = process.env.TURNSTILE_SECRET_KEY;
    const originalVercelEnv = process.env.VERCEL_ENV;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.TURNSTILE_SECRET_KEY;
      delete process.env.VERCEL_ENV;

      const result = await verifyTurnstileToken({ token: 'token' });

      expect(result).toEqual({ ok: false, reason: 'not_configured' });
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
      else process.env.TURNSTILE_SECRET_KEY = originalSecret;
      if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = originalVercelEnv;
    }
  });

  it('rejects a missing token', async () => {
    const result = await verifyTurnstileToken({ token: '', secretKey: 'secret' });
    expect(result).toEqual({ ok: false, reason: 'missing' });
  });

  it('accepts a valid token', async () => {
    const fetchImpl = jest.fn(async () => response({ success: true })) as unknown as typeof fetch;
    const result = await verifyTurnstileToken({
      token: 'valid',
      secretKey: 'secret',
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, skipped: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid and expired tokens', async () => {
    const invalidFetch = jest.fn(async () =>
      response({ success: false, 'error-codes': ['invalid-input-response'] })
    ) as unknown as typeof fetch;
    expect(
      await verifyTurnstileToken({ token: 'bad', secretKey: 'secret', fetchImpl: invalidFetch })
    ).toEqual({ ok: false, reason: 'invalid' });

    const expiredFetch = jest.fn(async () =>
      response({ success: false, 'error-codes': ['timeout-or-duplicate'] })
    ) as unknown as typeof fetch;
    expect(
      await verifyTurnstileToken({ token: 'old', secretKey: 'secret', fetchImpl: expiredFetch })
    ).toEqual({ ok: false, reason: 'expired' });
  });

  it('fails closed when the provider is unavailable or returns a non-2xx response', async () => {
    const networkFetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(
      await verifyTurnstileToken({ token: 'token', secretKey: 'secret', fetchImpl: networkFetch })
    ).toEqual({ ok: false, reason: 'provider_unavailable' });

    const httpFetch = jest.fn(async () => response({}, false)) as unknown as typeof fetch;
    expect(
      await verifyTurnstileToken({ token: 'token', secretKey: 'secret', fetchImpl: httpFetch })
    ).toEqual({ ok: false, reason: 'provider_unavailable' });
  });
});
