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

  it('skips Turnstile when no secret is configured', async () => {
    const result = await verifyTurnstileToken({ token: '', secretKey: '' });
    expect(result).toEqual({ ok: true, skipped: true });
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
