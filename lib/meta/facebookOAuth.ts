/**
 * Facebook Page OAuth 2.0 helpers.
 *
 * Verified against the official Meta documentation:
 * - Login dialog: https://www.facebook.com/{version}/dialog/oauth
 * - Code exchange: GET https://graph.facebook.com/{version}/oauth/access_token
 * - Long-lived user exchange: GET /oauth/access_token?grant_type=fb_exchange_token
 * - Page tokens: GET /{user-id}/accounts with a long-lived user token
 *
 * Token-bearing requests use the Authorization header wherever Meta supports
 * it. The two OAuth token endpoints are POSTed as a form first so the app
 * secret and authorization code never appear in a URL; a documented GET is
 * used only as a compatibility fallback for Meta versions that reject POST.
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
import { DEFAULT_FACEBOOK_GRAPH_VERSION, normalizeFacebookGraphVersion } from './facebookConfig';

export const FACEBOOK_OAUTH_SCOPE = 'pages_show_list,pages_read_engagement,pages_manage_posts';
export const FACEBOOK_REQUIRED_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
] as const;

export const FACEBOOK_OAUTH_STATE_COOKIE = 'meta_facebook_oauth_state';
export const FACEBOOK_OAUTH_PAGES_COOKIE = 'meta_facebook_oauth_pages';
export const FACEBOOK_OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
export const FACEBOOK_OAUTH_PAGES_MAX_AGE_SECONDS = 10 * 60;

const OAUTH_TIMEOUT_MS = 15_000;
const STATE_FUTURE_TOLERANCE_MS = 60_000;
const MAX_PAGE_PAGES = 5;

export type FacebookOAuthConfig = {
  appId: string | null;
  appSecret: string | null;
  version: string;
  configured: boolean;
  missing: string[];
};

export type FacebookPage = {
  id: string;
  name: string;
  accessToken: string;
  tasks: string[];
  perms: string[];
};

export type FacebookPageSummary = Pick<FacebookPage, 'id' | 'name' | 'tasks' | 'perms'>;

export type FacebookPageSelection = {
  issuedAt: number;
  userId: string | null;
  permissions: string[];
  pages: FacebookPage[];
};

export type FacebookUserToken = {
  accessToken: string;
  tokenType: string;
  expiresIn: number | null;
};

export type FacebookOAuthStateResult =
  | { ok: true; redirectUri: string; issuedAt: number }
  | { ok: false; reason: 'invalid' | 'expired' };

type PageListResult = { ok: true; pages: FacebookPage[] } | { ok: false; error: string };

type PageAccessResult =
  | { ok: true; id: string; name: string; tasks: string[]; perms: string[] }
  | { ok: false; error: string };

type PermissionsResult = { ok: true; permissions: string[] } | { ok: false; error: string };

export function readFacebookOAuthConfig(
  env: Record<string, string | undefined> = process.env
): FacebookOAuthConfig {
  const appId = readString(env.META_FACEBOOK_APP_ID);
  const appSecret = readString(env.META_FACEBOOK_APP_SECRET);
  const version = normalizeFacebookGraphVersion(env.META_GRAPH_API_VERSION);
  const missing: string[] = [];

  if (!appId) missing.push('META_FACEBOOK_APP_ID');
  if (!appSecret) missing.push('META_FACEBOOK_APP_SECRET');

  return {
    appId,
    appSecret,
    version,
    configured: missing.length === 0,
    missing,
  };
}

export function resolveFacebookRedirectUri(requestUrl: string): string {
  return new URL('/api/meta/facebook/callback', requestUrl).toString();
}

function graphBaseUrl(version: string): string {
  return `https://graph.facebook.com/${version || DEFAULT_FACEBOOK_GRAPH_VERSION}`;
}

function graphUrl(config: FacebookOAuthConfig, path: string): string {
  return `${graphBaseUrl(config.version)}/${path.replace(/^\/+/, '')}`;
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

export function createFacebookOAuthState(input: {
  secret: string;
  redirectUri: string;
  userId?: string | null;
  now?: number;
}): string {
  const payload = {
    v: 1,
    n: randomBytes(32).toString('base64url'),
    iat: input.now ?? Date.now(),
    redirectUri: input.redirectUri,
    userId: input.userId ?? null,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

  return `${encoded}.${hmacState(input.secret, encoded)}`;
}

export function verifyFacebookOAuthState(
  state: string,
  input: {
    secret: string;
    now?: number;
    maxAgeMs?: number;
  }
): FacebookOAuthStateResult {
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
  const maxAge = input.maxAgeMs ?? FACEBOOK_OAUTH_STATE_MAX_AGE_MS;

  if (issuedAt > now + STATE_FUTURE_TOLERANCE_MS) {
    return { ok: false, reason: 'invalid' };
  }

  if (now - issuedAt > maxAge) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, redirectUri, issuedAt };
}

export function buildFacebookAuthorizationUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
  version?: string;
  reRequest?: boolean;
}): string {
  const version = normalizeFacebookGraphVersion(input.version);
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);

  url.searchParams.set('client_id', input.appId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', FACEBOOK_OAUTH_SCOPE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', input.state);

  if (input.reRequest) {
    url.searchParams.set('auth_type', 'rerequest');
  }

  return url.toString();
}

function readExpiresIn(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    : [];
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

async function readResponseBody(response: Response): Promise<{
  payload: unknown;
  raw: string;
}> {
  let raw = '';

  try {
    raw = await response.text();
  } catch {
    raw = '';
  }

  if (raw) {
    try {
      return { payload: JSON.parse(raw) as unknown, raw };
    } catch {
      return { payload: null, raw };
    }
  }

  try {
    return { payload: await response.json(), raw: '' };
  } catch {
    return { payload: null, raw: '' };
  }
}

/**
 * Meta accepts the token endpoints as form-encoded POSTs as well as the
 * documented GET. POST is used exclusively so the app secret, authorization
 * code and User token never appear in a request URL.
 */
async function requestTokenEndpoint(input: {
  config: FacebookOAuthConfig;
  values: Record<string, string>;
  fetch: typeof fetch;
  fallbackLabel: string;
}): Promise<{
  ok: boolean;
  status: number;
  payload: unknown;
  error: string | null;
}> {
  try {
    const response = await input.fetch(graphUrl(input.config, 'oauth/access_token'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(input.values).toString(),
      signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
    });
    const body = await readResponseBody(response);

    return {
      ok: response.ok,
      status: response.status,
      payload: body.payload,
      error: response.ok
        ? null
        : redactOAuthError(
            body.payload,
            `${input.fallbackLabel} returned HTTP ${response.status}.`,
            [
              input.config.appSecret,
              input.config.appId,
              input.values.code,
              input.values.fb_exchange_token,
            ]
          ),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: null,
      error: isTimeoutError(error)
        ? `${input.fallbackLabel} timed out.`
        : redactOAuthError(error, `${input.fallbackLabel} failed.`, [
            input.config.appSecret,
            input.config.appId,
            input.values.code,
            input.values.fb_exchange_token,
          ]),
    };
  }
}

function readTokenPayload(payload: unknown): {
  accessToken: string | null;
  tokenType: string;
} {
  const root = readRecord(payload);

  return {
    accessToken: readString(root?.access_token),
    tokenType: readString(root?.token_type) ?? 'bearer',
  };
}

export async function exchangeFacebookAuthorizationCode(input: {
  config: FacebookOAuthConfig;
  code: string;
  redirectUri: string;
  fetch?: typeof fetch;
}): Promise<{ ok: true; token: FacebookUserToken } | { ok: false; error: string }> {
  if (!input.config.configured || !input.config.appId || !input.config.appSecret) {
    return { ok: false, error: 'Facebook OAuth is not configured.' };
  }

  const code = input.code.trim();

  if (!code) return { ok: false, error: 'Authorization code is missing.' };

  const result = await requestTokenEndpoint({
    config: input.config,
    fetch: input.fetch ?? fetch,
    values: {
      client_id: input.config.appId,
      client_secret: input.config.appSecret,
      redirect_uri: input.redirectUri,
      code,
    },
    fallbackLabel: 'Facebook authorization exchange',
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? 'Facebook authorization exchange failed.',
    };
  }

  const token = readTokenPayload(result.payload);

  if (!token.accessToken) {
    return {
      ok: false,
      error: 'Facebook did not return a short-lived user access token.',
    };
  }

  return {
    ok: true,
    token: {
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      expiresIn: readExpiresIn(readRecord(result.payload)?.expires_in),
    },
  };
}

export async function exchangeFacebookLongLivedUserToken(input: {
  config: FacebookOAuthConfig;
  shortLivedToken: string;
  fetch?: typeof fetch;
}): Promise<{ ok: true; token: FacebookUserToken } | { ok: false; error: string }> {
  if (!input.config.configured || !input.config.appId || !input.config.appSecret) {
    return { ok: false, error: 'Facebook OAuth is not configured.' };
  }

  const shortLivedToken = input.shortLivedToken.trim();

  if (!shortLivedToken) {
    return { ok: false, error: 'Short-lived Facebook token is missing.' };
  }

  const result = await requestTokenEndpoint({
    config: input.config,
    fetch: input.fetch ?? fetch,
    values: {
      grant_type: 'fb_exchange_token',
      client_id: input.config.appId,
      client_secret: input.config.appSecret,
      fb_exchange_token: shortLivedToken,
    },
    fallbackLabel: 'Facebook long-lived token exchange',
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? 'Facebook long-lived token exchange failed.',
    };
  }

  const token = readTokenPayload(result.payload);

  if (!token.accessToken) {
    return {
      ok: false,
      error: 'Facebook did not return a long-lived user access token.',
    };
  }

  return {
    ok: true,
    token: {
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      expiresIn: readExpiresIn(readRecord(result.payload)?.expires_in),
    },
  };
}

function safeNextPageUrl(value: unknown): string | null {
  const next = readString(value);
  if (!next) return null;

  try {
    const url = new URL(next);

    if (
      url.protocol !== 'https:' ||
      (url.hostname !== 'graph.facebook.com' && !url.hostname.endsWith('.facebook.com'))
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export async function fetchFacebookPages(input: {
  config: FacebookOAuthConfig;
  userToken: string;
  fetch?: typeof fetch;
}): Promise<PageListResult> {
  const fetcher = input.fetch ?? fetch;
  const pages: FacebookPage[] = [];
  let next: string | null = graphUrl(
    input.config,
    'me/accounts?fields=id,name,access_token,tasks,perms&limit=100'
  );

  for (let page = 0; page < MAX_PAGE_PAGES && next; page += 1) {
    let response: Response;
    let payload: unknown;

    try {
      response = await fetcher(next, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.userToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
      });
      payload = await response.json();
    } catch (error) {
      return {
        ok: false,
        error: isTimeoutError(error)
          ? 'Facebook Pages request timed out.'
          : sanitizeMetaError(error, input.userToken),
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: sanitizeMetaError(
          metaErrorMessage(payload) ?? `Facebook Pages request returned HTTP ${response.status}.`,
          input.userToken
        ),
      };
    }

    const root = readRecord(payload);
    const data = Array.isArray(root?.data) ? root.data : [];
    const paging = readRecord(root?.paging);

    for (const entry of data) {
      const record = readRecord(entry);
      const id = readString(record?.id);
      const name = readString(record?.name);
      const accessToken = readString(record?.access_token);

      if (!id || !accessToken) continue;

      pages.push({
        id,
        name: name ?? `Facebook Page ${id}`,
        accessToken,
        tasks: stringArray(record?.tasks),
        perms: stringArray(record?.perms),
      });
    }

    next = safeNextPageUrl(paging?.next);

    if (data.length === 0) break;
  }

  if (pages.length === 0) {
    return {
      ok: false,
      error:
        'Facebook returned no Pages for this account. The user must have a Page role and grant pages_show_list.',
    };
  }

  return { ok: true, pages };
}

export async function fetchFacebookGrantedPermissions(input: {
  config: FacebookOAuthConfig;
  userToken: string;
  fetch?: typeof fetch;
}): Promise<PermissionsResult> {
  const fetcher = input.fetch ?? fetch;

  try {
    const response = await fetcher(graphUrl(input.config, 'me/permissions'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.userToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
    });
    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      return {
        ok: false,
        error: sanitizeMetaError(
          metaErrorMessage(payload) ??
            `Facebook permissions request returned HTTP ${response.status}.`,
          input.userToken
        ),
      };
    }

    const root = readRecord(payload);
    const data = Array.isArray(root?.data) ? root.data : [];
    const permissions = data
      .map((entry) => readRecord(entry))
      .filter(
        (entry): entry is Record<string, unknown> => Boolean(entry) && entry?.status === 'granted'
      )
      .map((entry) => readString(entry.permission))
      .filter((permission): permission is string => Boolean(permission));

    return { ok: true, permissions };
  } catch (error) {
    return {
      ok: false,
      error: isTimeoutError(error)
        ? 'Facebook permissions request timed out.'
        : sanitizeMetaError(error, input.userToken),
    };
  }
}

export function missingFacebookScopes(scopes: string[]): string[] {
  if (scopes.length === 0) return [];
  return FACEBOOK_REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
}

export async function verifyFacebookPageAccess(input: {
  config: FacebookOAuthConfig;
  pageId: string;
  pageToken: string;
  fetch?: typeof fetch;
}): Promise<PageAccessResult> {
  const fetcher = input.fetch ?? fetch;
  const url = graphUrl(
    input.config,
    `${encodeURIComponent(input.pageId)}?fields=id,name,tasks,perms`
  );

  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.pageToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
    });
    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      return {
        ok: false,
        error: sanitizeMetaError(
          metaErrorMessage(payload) ??
            `Facebook Page verification returned HTTP ${response.status}.`,
          input.pageToken
        ),
      };
    }

    const root = readRecord(payload);
    const id = readString(root?.id);

    if (!id || id !== input.pageId) {
      return {
        ok: false,
        error: 'Facebook returned an unexpected Page identity.',
      };
    }

    return {
      ok: true,
      id,
      name: readString(root?.name) ?? `Facebook Page ${id}`,
      tasks: stringArray(root?.tasks),
      perms: stringArray(root?.perms),
    };
  } catch (error) {
    return {
      ok: false,
      error: isTimeoutError(error)
        ? 'Facebook Page verification timed out.'
        : sanitizeMetaError(error, input.pageToken),
    };
  }
}

function selectionKey(secret: string): Buffer {
  return createHash('sha256').update(`facebook-oauth-pages:${secret}`).digest();
}

export function encryptFacebookPageSelection(
  selection: FacebookPageSelection,
  secret: string
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', selectionKey(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(selection), 'utf8')),
    cipher.final(),
  ]);

  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptFacebookPageSelection(
  value: string | null | undefined,
  secret: string,
  now = Date.now()
): FacebookPageSelection | null {
  if (!value) return null;

  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;

  const [, ivValue, tagValue, encryptedValue] = parts;

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      selectionKey(secret),
      Buffer.from(ivValue, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]);
    const payload = JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;

    const issuedAt = payload.issuedAt;

    if (
      typeof issuedAt !== 'number' ||
      !Number.isFinite(issuedAt) ||
      issuedAt > now + STATE_FUTURE_TOLERANCE_MS ||
      now - issuedAt > FACEBOOK_OAUTH_STATE_MAX_AGE_MS
    ) {
      return null;
    }

    const pages = Array.isArray(payload.pages) ? payload.pages : [];
    const parsedPages: FacebookPage[] = [];

    for (const entry of pages) {
      const record = readRecord(entry);
      const id = readString(record?.id);
      const name = readString(record?.name);
      const accessToken = readString(record?.accessToken);

      if (!id || !name || !accessToken) continue;

      parsedPages.push({
        id,
        name,
        accessToken,
        tasks: stringArray(record?.tasks),
        perms: stringArray(record?.perms),
      });
    }

    if (parsedPages.length === 0) return null;

    return {
      issuedAt,
      userId: readString(payload.userId),
      permissions: stringArray(payload.permissions),
      pages: parsedPages,
    };
  } catch {
    return null;
  }
}

export function summarizeFacebookPages(pages: FacebookPage[]): FacebookPageSummary[] {
  return pages.map(({ id, name, tasks, perms }) => ({ id, name, tasks, perms }));
}
