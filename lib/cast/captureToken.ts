import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Capture tokens are short-lived, single-use authorizations for linking a
 * finished reading to an email address.
 *
 * v2 layout: `v2.<expiresAtMs>.<nonce>.<hmac>`
 *
 * The HMAC is bound to the exact record, its creation timestamp, the expiry and
 * a random nonce. The server additionally requires the record's
 * `capture_consumed_at` column to be null before a token is accepted, which
 * makes a successfully used token unreplayable even if it is still inside the
 * TTL window. Tokens minted by the previous version (no expiry, no nonce) are
 * rejected: an authorization that never expires must not linger in a browser
 * session store.
 */

const TOKEN_VERSION = 'v2';
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

export type CastCaptureTokenParts = {
  token: string;
  expiresAt: string;
  expiresAtMs: number;
  nonce: string;
};

export type CastCaptureTokenVerification =
  | {
      valid: true;
      expiresAt: string;
      expiresAtMs: number;
      nonce: string;
    }
  | { valid: false; reason: 'malformed' | 'expired' | 'signature' };

function captureSecret(): string {
  const secret =
    process.env.CAST_CAPTURE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) throw new Error('Cast capture secret is not configured.');
  return secret;
}

export function castCaptureTtlSeconds(): number {
  const raw = Number(process.env.CAST_CAPTURE_TTL_SECONDS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_SECONDS;

  // Keep the authorization narrow: at least an hour, at most thirty days.
  return Math.min(Math.max(Math.floor(raw), 60 * 60), 30 * 24 * 60 * 60);
}

function sign(
  recordId: string,
  createdAt: string,
  expiresAtMs: number,
  nonce: string
): string {
  return createHmac('sha256', captureSecret())
    .update(
      `${TOKEN_VERSION}:${recordId}:${createdAt}:${expiresAtMs}:${nonce}`
    )
    .digest('hex');
}

export function createCastCaptureTokenWithMetadata(
  recordId: string,
  createdAt: string,
  nowMs: number = Date.now()
): CastCaptureTokenParts {
  const expiresAtMs = nowMs + castCaptureTtlSeconds() * 1000;
  const nonce = randomBytes(16).toString('hex');
  const signature = sign(recordId, createdAt, expiresAtMs, nonce);

  return {
    token: `${TOKEN_VERSION}.${expiresAtMs}.${nonce}.${signature}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    nonce,
  };
}

/** Convenience wrapper kept for callers that only need the token string. */
export function createCastCaptureToken(
  recordId: string,
  createdAt: string,
  nowMs: number = Date.now()
): string {
  return createCastCaptureTokenWithMetadata(recordId, createdAt, nowMs).token;
}

export function verifyCastCaptureTokenDetailed(
  token: unknown,
  recordId: string,
  createdAt: string,
  nowMs: number = Date.now()
): CastCaptureTokenVerification {
  if (typeof token !== 'string') return { valid: false, reason: 'malformed' };

  const parts = token.split('.');

  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) {
    return { valid: false, reason: 'malformed' };
  }

  const expiresAtMs = Number(parts[1]);

  if (
    !Number.isInteger(expiresAtMs) ||
    expiresAtMs <= 0 ||
    !/^[a-f0-9]{32}$/i.test(parts[2]) ||
    !/^[a-f0-9]{64}$/i.test(parts[3])
  ) {
    return { valid: false, reason: 'malformed' };
  }

  if (expiresAtMs <= nowMs) {
    return { valid: false, reason: 'expired' };
  }

  const expected = Buffer.from(
    sign(recordId, createdAt, expiresAtMs, parts[2]),
    'hex'
  );
  const supplied = Buffer.from(parts[3], 'hex');

  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return { valid: false, reason: 'signature' };
  }

  return {
    valid: true,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    nonce: parts[2],
  };
}

export function verifyCastCaptureToken(
  token: unknown,
  recordId: string,
  createdAt: string,
  nowMs: number = Date.now()
): boolean {
  return verifyCastCaptureTokenDetailed(token, recordId, createdAt, nowMs).valid;
}
