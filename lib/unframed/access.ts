import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed UNFRAMED access tokens.
 *
 * The reader paywall previously used `unframed_access=true` and
 * `unframed_admin=true` cookies. Any visitor could create those cookies and
 * read the manuscript without paying. The cookie value is now an HMAC-signed
 * scope + expiry pair.
 */

export type UnframedScope = 'access' | 'admin';

function accessSecret(): string | null {
  const secret =
    process.env.NEXT_JWT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.UNFRAMED_ACCESS_SECRET;

  return secret && secret.length >= 32 ? secret : null;
}

function sign(scope: UnframedScope, expiresAt: number, secret: string): string {
  return createHmac('sha256', secret).update(`${scope}.${expiresAt}`).digest('base64url');
}

export function signUnframedToken(scope: UnframedScope, ttlSeconds: number): string | null {
  const secret = accessSecret();
  if (!secret) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

  return `${scope}.${expiresAt}.${sign(scope, expiresAt, secret)}`;
}

export function verifyUnframedToken(
  value: string | null | undefined,
  scope: UnframedScope,
  now: number = Date.now()
): boolean {
  const secret = accessSecret();
  if (!secret || typeof value !== 'string') return false;

  const [tokenScope, rawExpiry, signature, ...rest] = value.split('.');
  if (rest.length || tokenScope !== scope || !rawExpiry || !signature) {
    return false;
  }

  const expiresAt = Number(rawExpiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) {
    return false;
  }

  const expected = sign(scope, expiresAt, secret);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
