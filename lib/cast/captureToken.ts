import { createHmac, timingSafeEqual } from 'node:crypto';

function captureSecret(): string {
  const secret = process.env.CAST_CAPTURE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Cast capture secret is not configured.');
  return secret;
}

export function createCastCaptureToken(recordId: string, createdAt: string): string {
  return createHmac('sha256', captureSecret())
    .update(`${recordId}:${createdAt}`)
    .digest('hex');
}

export function verifyCastCaptureToken(
  token: unknown,
  recordId: string,
  createdAt: string
): boolean {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return false;
  const expected = Buffer.from(createCastCaptureToken(recordId, createdAt), 'hex');
  const supplied = Buffer.from(token, 'hex');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
