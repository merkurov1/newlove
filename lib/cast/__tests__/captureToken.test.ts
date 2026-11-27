import {
  castCaptureTtlSeconds,
  createCastCaptureToken,
  createCastCaptureTokenWithMetadata,
  verifyCastCaptureToken,
  verifyCastCaptureTokenDetailed,
} from '@/lib/cast/captureToken';

describe('Cast capture token', () => {
  const original = process.env.CAST_CAPTURE_SECRET;

  beforeAll(() => {
    process.env.CAST_CAPTURE_SECRET = 'test-capture-secret';
  });

  afterAll(() => {
    process.env.CAST_CAPTURE_SECRET = original;
  });

  it('accepts only the token bound to the record and creation time', () => {
    const token = createCastCaptureToken('cast-1', '2026-01-01T00:00:00.000Z');
    expect(verifyCastCaptureToken(token, 'cast-1', '2026-01-01T00:00:00.000Z')).toBe(true);
    expect(verifyCastCaptureToken(token, 'cast-2', '2026-01-01T00:00:00.000Z')).toBe(false);
    expect(verifyCastCaptureToken(token, 'cast-1', '2026-01-02T00:00:00.000Z')).toBe(false);
    expect(verifyCastCaptureToken('invalid', 'cast-1', '2026-01-01T00:00:00.000Z')).toBe(false);
  });

  it('expires after the configured TTL', () => {
    const issuedAt = Date.parse('2026-01-01T00:00:00.000Z');
    const token = createCastCaptureToken('cast-1', '2026-01-01T00:00:00.000Z', issuedAt);
    const ttlMs = castCaptureTtlSeconds() * 1000;

    expect(
      verifyCastCaptureToken(
        token,
        'cast-1',
        '2026-01-01T00:00:00.000Z',
        issuedAt + ttlMs - 1000
      )
    ).toBe(true);

    const expired = verifyCastCaptureTokenDetailed(
      token,
      'cast-1',
      '2026-01-01T00:00:00.000Z',
      issuedAt + ttlMs + 1000
    );

    expect(expired).toMatchObject({ valid: false, reason: 'expired' });
  });

  it('never accepts a legacy token without an expiry', () => {
    // The previous format was a bare hex HMAC with no TTL.
    const legacy = 'a'.repeat(64);

    expect(
      verifyCastCaptureTokenDetailed(
        legacy,
        'cast-1',
        '2026-01-01T00:00:00.000Z'
      )
    ).toEqual({ valid: false, reason: 'malformed' });
  });

  it('issues a different nonce for every token', () => {
    const first = createCastCaptureTokenWithMetadata('cast-1', '2026-01-01T00:00:00.000Z');
    const second = createCastCaptureTokenWithMetadata('cast-1', '2026-01-01T00:00:00.000Z');

    expect(first.nonce).not.toBe(second.nonce);
    expect(first.token).not.toBe(second.token);
    expect(verifyCastCaptureToken(first.token, 'cast-1', '2026-01-01T00:00:00.000Z')).toBe(true);
    expect(verifyCastCaptureToken(second.token, 'cast-1', '2026-01-01T00:00:00.000Z')).toBe(true);
  });

  it('rejects a tampered expiry or signature', () => {
    const token = createCastCaptureToken('cast-1', '2026-01-01T00:00:00.000Z');
    const parts = token.split('.');

    const shifted = [parts[0], String(Number(parts[1]) + 86_400_000), parts[2], parts[3]].join('.');
    const tampered = [parts[0], parts[1], parts[2], 'b'.repeat(64)].join('.');

    expect(verifyCastCaptureToken(shifted, 'cast-1', '2026-01-01T00:00:00.000Z')).toBe(false);
    expect(verifyCastCaptureToken(tampered, 'cast-1', '2026-01-01T00:00:00.000Z')).toBe(false);
  });
});
