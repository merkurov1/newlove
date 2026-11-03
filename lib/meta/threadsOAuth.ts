/**
 * Threads OAuth 2.0 helpers.
 *
 * Verified against the official Threads API documentation:
 * - Authorization window: https://threads.com/oauth/authorize
 * - Code exchange: POST https://graph.threads.com/oauth/access_token
 * - Long-lived exchange: https://graph.threads.com/access_token
 * - Publishing API host (unchanged): graph.threads.net
 *
 * The app secret and tokens are never placed in a URL. The long-lived
 * exchange is documented as GET with query parameters, but the same fields are
 * sent as a form-encoded POST body here so secrets never appear in a request
 * URL, proxy log or application log.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import {
  isTimeoutError,
  metaErrorMessage,
  readRecord,
  readString,
  sanitizeMetaError,
} from './http';

export const THREADS_AUTHORIZE_URL = 'https://threads.com/oauth/authorize';
export const THREADS_CODE_TOKEN_URL = 'https://graph.threads.com/oauth/access_token';
export const THREADS_LONG_LIVED_TOKEN_URL = 'https://graph.threads.com/access_token';
export const THREADS_OAUTH_SCOPE = 'threads_basic,threads_content_publish';

export const THREADS_OAUTH_STATE_COOKIE = 'meta_threads_oauth_state';
export const THREADS_OAUTH_RESULT_COOKIE = 'meta_threads_oauth_result';
export const THREADS_OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
export const THREADS_OAUTH_RESULT_MAX_AGE_SECONDS = 10 * 60;

const OAUTH_TIMEOUT_MS = 15_000;
const STATE_FUTURE_TOLERANCE_MS = 60_000;

export type ThreadsOAuthConfig = {
  appId: string | null;
  appSecret: string | null;
  configured: boolean;
};

export type ThreadsOAuthToken = {
  userId: string;
  accessToken: string;
  tokenType: string;
  expiresIn: number | null;
  obtainedAt: string;
};

export type ThreadsOAuthExchangeResult =
  { ok: true; token: ThreadsOAuthToken } | { ok: false; error: string };

export type ThreadsOAuthStateResult =
  | { ok: true; redirectUri: string; issuedAt: number }
  | { ok: false; reason: 'invalid' | 'expired' };

type ShortTokenExchange =
  | {
      ok: true;
      userId: string;
      accessToken: string;
      tokenType: string;
    }
  | { ok: false; error: string };

type LongTokenExchange =
  | {
      ok: true;
      accessToken: string;
      tokenType: string;
      expiresIn: number | null;
    }
  | { ok: false; error: string };

export function readThreadsOAuthConfig(
  env: Record<string, string | undefined> = process.env
): ThreadsOAuthConfig {
  const appId = readString(env.META_THREADS_APP_ID);
  const appSecret = readString(env.META_THREADS_APP_SECRET);

  return {
    appId,
    appSecret,
    configured: Boolean(appId && appSecret),
  };
}

export function resolveThreadsRedirectUri(requestUrl: string): string {
  return new URL('/api/meta/threads/callback', requestUrl).toString();
}

function hmacState(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createThreadsOAuthState(input: {
  secret: string;
  redirectUri: string;
  now?: number;
}): string {
  const payload = {
    v: 1,
    n: randomBytes(32).toString('base64url'),
    iat: input.now ?? Date.now(),
    redirectUri: input.redirectUri,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

  return `${encoded}.${hmacState(input.secret, encoded)}`;
}

export function verifyThreadsOAuthState(
  state: string,
  input: {
    secret: string;
    now?: number;
    maxAgeMs?: number;
  }
): ThreadsOAuthStateResult {
  const parts = state.split('.');

  if (parts.length !== 2) return { ok: false, reason: 'invalid' };

  const [encoded, signature] = parts;
  const expected = hmacState(input.secret, encoded);

  if (!constantTimeEqual(signature, expected)) {
    return { ok: false, reason: 'invalid' };
  }

  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const issuedAt = payload.iat;
  const redirectUri = readString(payload.redirectUri);

  if (
    payload.v !== 1 ||
    typeof issuedAt !== 'number' ||
    !Number.isFinite(issuedAt) ||
    !redirectUri
  ) {
    return { ok: false, reason: 'invalid' };
  }

  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: 'invalid' };
    }
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const now = input.now ?? Date.now();
  const maxAge = input.maxAgeMs ?? THREADS_OAUTH_STATE_MAX_AGE_MS;

  if (issuedAt > now + STATE_FUTURE_TOLERANCE_MS) {
    return { ok: false, reason: 'invalid' };
  }

  if (now - issuedAt > maxAge) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, redirectUri, issuedAt };
}

export function buildThreadsAuthorizationUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(THREADS_AUTHORIZE_URL);
  url.searchParams.set('client_id', input.appId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', THREADS_OAUTH_SCOPE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', input.state);

  return url.toString();
}

function readExpiresIn(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Read the raw body as well as the parsed payload. Threads returns numeric
 * user IDs that can exceed Number.MAX_SAFE_INTEGER, so the ID must be taken
 * from the raw JSON text rather than from a rounded JavaScript number.
 */
async function readOAuthResponse(response: Response): Promise<{
  payload: unknown;
  raw: string;
}> {
  let raw: string | null = null;

  try {
    raw = await response.text();
  } catch {
    raw = null;
  }

  if (raw !== null) {
    try {
      return { payload: JSON.parse(raw) as unknown, raw };
    } catch {
      return { payload: null, raw };
    }
  }

  return { payload: await readJson(response), raw: '' };
}

function extractUserId(raw: string, payload: unknown): string | null {
  const match = raw.match(/"user_id"\s*:\s*"?(\d+)"?/);
  if (match?.[1]) return match[1];

  const value = readRecord(payload)?.user_id;

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return value.trim();
  }

  // Fallback for mocked/older transports without a raw body. Large numeric
  // IDs may already be rounded here, so the raw-text path above is preferred.
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return null;
}

function redactOAuthError(
  payload: unknown,
  fallback: string,
  secrets: Array<string | null | undefined>
): string {
  const root = readRecord(payload);
  const message =
    metaErrorMessage(payload) ??
    readString(root?.error_message) ??
    readString(root?.message) ??
    fallback;

  let sanitized = sanitizeMetaError(message, secrets[0]);

  for (const secret of secrets) {
    if (secret) sanitized = sanitized.split(secret).join('[redacted]');
  }

  return sanitized.slice(0, 300);
}

export async function exchangeThreadsAuthorizationCode(input: {
  config: ThreadsOAuthConfig;
  code: string;
  redirectUri: string;
  fetch?: typeof fetch;
}): Promise<ShortTokenExchange> {
  if (!input.config.configured || !input.config.appId || !input.config.appSecret) {
    return { ok: false, error: 'Threads OAuth is not configured.' };
  }

  if (!input.code.trim()) {
    return { ok: false, error: 'Authorization code is missing.' };
  }

  const fetcher = input.fetch ?? fetch;
  const body = new URLSearchParams({
    client_id: input.config.appId,
    client_secret: input.config.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
    code: input.code,
  });

  try {
    const response = await fetcher(THREADS_CODE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
    });
    const { payload, raw } = await readOAuthResponse(response);

    if (!response.ok) {
      return {
        ok: false,
        error: redactOAuthError(
          payload,
          `Threads authorization exchange returned HTTP ${response.status}.`,
          [input.config.appSecret, input.code]
        ),
      };
    }

    const root = readRecord(payload);
    const accessToken = readString(root?.access_token);
    const userId = extractUserId(raw, payload);

    if (!accessToken) {
      return {
        ok: false,
        error: 'Threads did not return a short-lived access token.',
      };
    }

    if (!userId) {
      return {
        ok: false,
        error: 'Threads did not return a user ID.',
      };
    }

    return {
      ok: true,
      userId,
      accessToken,
      tokenType: readString(root?.token_type) ?? 'bearer',
    };
  } catch (error) {
    return {
      ok: false,
      error: isTimeoutError(error)
        ? 'Threads authorization exchange timed out.'
        : redactOAuthError(error, 'Threads authorization exchange failed.', [
            input.config.appSecret,
            input.code,
          ]),
    };
  }
}

export async function exchangeThreadsLongLivedToken(input: {
  config: ThreadsOAuthConfig;
  shortLivedToken: string;
  fetch?: typeof fetch;
}): Promise<LongTokenExchange> {
  if (!input.config.configured || !input.config.appSecret) {
    return { ok: false, error: 'Threads OAuth is not configured.' };
  }

  if (!input.shortLivedToken.trim()) {
    return { ok: false, error: 'Short-lived Threads token is missing.' };
  }

  const fetcher = input.fetch ?? fetch;
  const body = new URLSearchParams({
    grant_type: 'th_exchange_token',
    client_secret: input.config.appSecret,
    access_token: input.shortLivedToken,
  });

  try {
    const response = await fetcher(THREADS_LONG_LIVED_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return {
        ok: false,
        error: redactOAuthError(
          payload,
          `Threads long-lived token exchange returned HTTP ${response.status}.`,
          [input.config.appSecret, input.shortLivedToken]
        ),
      };
    }

    const root = readRecord(payload);
    const accessToken = readString(root?.access_token);

    if (!accessToken) {
      return {
        ok: false,
        error: 'Threads did not return a long-lived access token.',
      };
    }

    return {
      ok: true,
      accessToken,
      tokenType: readString(root?.token_type) ?? 'bearer',
      expiresIn: readExpiresIn(root?.expires_in),
    };
  } catch (error) {
    return {
      ok: false,
      error: isTimeoutError(error)
        ? 'Threads long-lived token exchange timed out.'
        : redactOAuthError(error, 'Threads long-lived token exchange failed.', [
            input.config.appSecret,
            input.shortLivedToken,
          ]),
    };
  }
}

export async function completeThreadsOAuth(input: {
  config: ThreadsOAuthConfig;
  code: string;
  redirectUri: string;
  fetch?: typeof fetch;
  now?: () => Date;
}): Promise<ThreadsOAuthExchangeResult> {
  const short = await exchangeThreadsAuthorizationCode({
    config: input.config,
    code: input.code,
    redirectUri: input.redirectUri,
    fetch: input.fetch,
  });

  if (!short.ok) return short;

  const long = await exchangeThreadsLongLivedToken({
    config: input.config,
    shortLivedToken: short.accessToken,
    fetch: input.fetch,
  });

  if (!long.ok) return long;

  return {
    ok: true,
    token: {
      userId: short.userId,
      accessToken: long.accessToken,
      tokenType: long.tokenType,
      expiresIn: long.expiresIn,
      obtainedAt: (input.now ?? (() => new Date()))().toISOString(),
    },
  };
}

function resultKey(secret: string): Buffer {
  return createHash('sha256').update(`threads-oauth-result:${secret}`).digest();
}

export function encryptThreadsOAuthResult(token: ThreadsOAuthToken, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', resultKey(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(token), 'utf8')),
    cipher.final(),
  ]);

  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptThreadsOAuthResult(
  value: string | null | undefined,
  secret: string
): ThreadsOAuthToken | null {
  if (!value) return null;
  const parts = value.split('.');

  if (parts.length !== 4 || parts[0] !== 'v1') return null;

  const [, ivValue, tagValue, encryptedValue] = parts;

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      resultKey(secret),
      Buffer.from(ivValue, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]);
    const payload = JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;

    const userId = readString(payload.userId);
    const accessToken = readString(payload.accessToken);
    const tokenType = readString(payload.tokenType);
    const obtainedAt = readString(payload.obtainedAt);

    if (!userId || !accessToken || !tokenType || !obtainedAt) return null;

    return {
      userId,
      accessToken,
      tokenType,
      expiresIn: readExpiresIn(payload.expiresIn),
      obtainedAt,
    };
  } catch {
    return null;
  }
}
