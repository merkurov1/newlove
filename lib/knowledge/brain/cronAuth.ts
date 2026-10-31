import crypto from 'node:crypto';

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');

  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
 * CRON_SECRET is configured. External schedulers must send the same header.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = (process.env.CRON_SECRET || '').trim();

  if (!secret) return false;

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';

  return Boolean(token) && safeEqual(token, secret);
}
