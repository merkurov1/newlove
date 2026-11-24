import { createCastCaptureToken, verifyCastCaptureToken } from '@/lib/cast/captureToken';

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
});
