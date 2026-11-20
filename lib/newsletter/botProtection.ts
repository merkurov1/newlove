import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/newsletter/botProtection');

export const NEWSLETTER_BOT_FIELD = 'website';
export const NEWSLETTER_FORM_STARTED_FIELD = 'formStartedAt';

/** A real person needs at least a moment to read and fill the form. */
export const NEWSLETTER_MIN_FORM_AGE_MS = 1_000;
/** Do not accept forms that sat open indefinitely (also limits replay). */
export const NEWSLETTER_MAX_FORM_AGE_MS = 24 * 60 * 60 * 1000;

export type SignupTimingReason = 'missing' | 'too_fast' | 'expired';

export type SignupTimingResult =
  | { ok: true; ageMs: number }
  | { ok: false; reason: SignupTimingReason };

/**
 * Server-side timing check. The timestamp is only a friction signal: a missing
 * or malformed value is rejected, but it is never stored or reported with PII.
 */
export function checkSignupTiming(value: unknown, now: number = Date.now()): SignupTimingResult {
  const startedAt = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    return { ok: false, reason: 'missing' };
  }

  const ageMs = now - startedAt;

  if (ageMs < NEWSLETTER_MIN_FORM_AGE_MS) {
    return { ok: false, reason: 'too_fast' };
  }

  if (ageMs > NEWSLETTER_MAX_FORM_AGE_MS) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, ageMs };
}

/** A filled honeypot is a strong automated-submission signal. */
export function honeypotWasFilled(...values: unknown[]): boolean {
  return values.some((value) => typeof value === 'string' && value.trim().length > 0);
}

export type TurnstileFailureReason =
  | 'missing'
  | 'invalid'
  | 'expired'
  | 'provider_unavailable'
  | 'invalid_response';

export type TurnstileVerificationResult =
  | { ok: true; skipped: boolean }
  | { ok: false; reason: TurnstileFailureReason };

type TurnstileResponse = {
  success?: unknown;
  'error-codes'?: unknown;
};

function turnstileErrorCodes(body: TurnstileResponse): string[] {
  const value = body['error-codes'];
  return Array.isArray(value) ? value.map(String) : [];
}

/**
 * Verifies a Cloudflare Turnstile token on the server. When no secret is
 * configured the check is explicitly skipped so older deployments keep
 * working; production should configure both the site key and the secret.
 *
 * The token, secret and remote IP are never logged.
 */
export async function verifyTurnstileToken(input: {
  token: unknown;
  remoteIp?: string | null;
  secretKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<TurnstileVerificationResult> {
  const secret = (input.secretKey ?? process.env.TURNSTILE_SECRET_KEY ?? '').trim();

  if (!secret) {
    return { ok: true, skipped: true };
  }

  const token = typeof input.token === 'string' ? input.token.trim() : '';

  if (!token) {
    return { ok: false, reason: 'missing' };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    secret,
    response: token,
  });

  if (input.remoteIp && input.remoteIp !== 'unknown') {
    body.set('remoteip', input.remoteIp);
  }

  const timeoutMs = Math.max(1_000, Math.min(input.timeoutMs ?? 5_000, 15_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      return { ok: false, reason: 'provider_unavailable' };
    }

    let payload: TurnstileResponse;

    try {
      payload = (await response.json()) as TurnstileResponse;
    } catch {
      return { ok: false, reason: 'invalid_response' };
    }

    if (payload.success === true) {
      return { ok: true, skipped: false };
    }

    const codes = turnstileErrorCodes(payload);

    if (codes.includes('timeout-or-duplicate')) {
      return { ok: false, reason: 'expired' };
    }

    if (codes.includes('missing-input-response')) {
      return { ok: false, reason: 'missing' };
    }

    if (
      codes.includes('internal-error') ||
      codes.includes('missing-input-secret') ||
      codes.includes('invalid-input-secret')
    ) {
      return { ok: false, reason: 'provider_unavailable' };
    }

    return { ok: false, reason: 'invalid' };
  } catch {
    return { ok: false, reason: 'provider_unavailable' };
  } finally {
    clearTimeout(timeout);
  }
}
