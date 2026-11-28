import crypto from 'node:crypto';

import { assertServerOnly } from '@/lib/serverOnly';
import {
  normalizeFlowInstantViewPageUrl,
  telegramInstantViewTemplateHash,
} from '@/lib/telegram/instantView';

import {
  instantViewFingerprint,
  instantViewSessionKeySource,
  openInstantViewSecret,
  sealInstantViewSecret,
} from './instantViewSessionCrypto';
import {
  createSupabaseInstantViewSessionStore,
  emptyInstantViewSessionState,
  InstantViewStorageError,
  type InstantViewHashStatus,
  type InstantViewSessionState,
  type InstantViewSessionStore,
  type InstantViewTemplateDetailStatus,
  type InstantViewTemplateState,
} from './instantViewSessionStore';

assertServerOnly('lib/telegram/instantViewAuth');

const EDITOR_ORIGIN = 'https://instantview.telegram.org';
const REQUEST_TIMEOUT_MS = 15_000;
const PENDING_TTL_MS = 10 * 60 * 1000;
const USER_AGENT = 'merkurov.love Instant View admin session/1.0 (+https://www.merkurov.love)';
const MAX_TEMPLATE_DETAIL_PAGES = 2;
const MAX_TEMPLATE_PREVIEW_PAGES = 2;
const RHASH_VALUE = /^[a-f0-9]{8,64}$/i;

export type InstantViewAuthEnv = {
  TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH?: string;
  TELEGRAM_INSTANT_VIEW_HASH?: string;
};

export type InstantViewAuthDeps = {
  fetch?: typeof fetch;
  store?: InstantViewSessionStore;
  now?: () => number;
  env?: InstantViewAuthEnv;
};

export type InstantViewAuthErrorCode =
  | 'invalid_phone'
  | 'login_request_failed'
  | 'login_not_started'
  | 'login_check_failed'
  | 'session_cookie_missing'
  | 'session_verification_failed'
  | 'session_unreadable'
  | 'editor_unreachable'
  | 'storage_unavailable';

export class InstantViewAuthError extends Error {
  readonly code: InstantViewAuthErrorCode;

  constructor(code: InstantViewAuthErrorCode, message = 'Instant View authorization failed.') {
    super(message);
    this.name = 'InstantViewAuthError';
    this.code = code;
  }
}

export type InstantViewPublicStatus = {
  status: InstantViewSessionState['status'];
  storage: 'available' | 'unavailable';
  keySource: 'dedicated' | 'derived' | 'unavailable';
  hashConfigured: boolean;
  pendingExpiresAt: string | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
  template: InstantViewTemplateState | null;
};

function depsWithDefaults(deps: InstantViewAuthDeps = {}) {
  return {
    fetcher: deps.fetch ?? fetch,
    store: deps.store ?? createSupabaseInstantViewSessionStore(),
    now: deps.now ?? Date.now,
    env: deps.env ?? (process.env as InstantViewAuthEnv),
  };
}

/**
 * Telegram's editor accepts an international phone number. We only normalize
 * the value the owner types into the official editor flow; it is never stored
 * in the database, logs or analytics.
 */
export function normalizeInstantViewPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const compact = value.trim().replace(/[\s().-]+/g, '');
  if (!/^\+[1-9]\d{6,14}$/.test(compact)) return null;

  return compact;
}

function formBody(values: Record<string, string>): string {
  return new URLSearchParams(values).toString();
}

async function editorFetch(
  fetcher: typeof fetch,
  path: string,
  init: RequestInit
): Promise<Response> {
  return fetcher(`${EDITOR_ORIGIN}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
    headers: {
      accept: 'application/json, text/html;q=0.9',
      'user-agent': USER_AGENT,
      // The official editor's jQuery AJAX calls include this header.
      'x-requested-with': 'XMLHttpRequest',
      ...(init.headers ?? {}),
    },
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function sessionCookies(response: Response): string | null {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const raw =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (() => {
          const single = response.headers.get('set-cookie');
          return single ? [single] : [];
        })();

  const pairs = raw
    .map((value) => value.split(';', 1)[0]?.trim() ?? '')
    .filter((value) => /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+=.+/.test(value));

  if (!pairs.length) return null;

  return pairs.join('; ');
}

export function isAuthenticatedEditorHtml(status: number, html: string): boolean {
  if (status !== 200) return false;
  if (/App\.unauth\s*=\s*true/.test(html)) return false;
  if (/openPopup\('#login-popup-container'\)/.test(html)) return false;

  return /My Templates/i.test(html);
}

async function verifyEditorCookie(
  fetcher: typeof fetch,
  cookie: string
): Promise<{ ok: boolean; html: string | null }> {
  let response: Response;

  try {
    response = await editorFetch(fetcher, '/my/', {
      method: 'GET',
      redirect: 'manual',
      headers: {
        cookie,
        accept: 'text/html',
      },
    });
  } catch {
    throw new InstantViewAuthError('editor_unreachable', 'Instant View editor is unreachable.');
  }

  const html = await response.text().catch(() => '');
  return { ok: isAuthenticatedEditorHtml(response.status, html), html };
}

function safeHashEqual(left: string, right: string): boolean {
  const a = Buffer.from(left.toLowerCase(), 'utf8');
  const b = Buffer.from(right.toLowerCase(), 'utf8');

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/&#x0*26;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function editorUrl(href: string, base: string | URL = EDITOR_ORIGIN): URL | null {
  let url: URL;

  try {
    url = new URL(decodeHtmlEntities(href).trim(), base);
  } catch {
    return null;
  }

  // Only the official editor is ever fetched or followed. This prevents an
  // editor page from redirecting the worker to an unrelated internal host.
  if (url.origin !== EDITOR_ORIGIN) return null;

  return url;
}

function hrefValues(html: string): string[] {
  const values: string[] = [];

  for (const match of html.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    values.push(match[1] ?? match[2] ?? '');
  }

  return values;
}

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Extract an editor-issued `rhash` from a URL or from the encoded URL inside a
 * Telegram share link. The real "View in Telegram" anchor looks like:
 *
 *   https://t.me/share/url?url=https%3A%2F%2Ft.me%2Fiv%3Furl%3D…%26rhash%3D…
 *
 * The hash is therefore usually percent-encoded twice and never appears as a
 * plain `?rhash=` on the listing page. The old parser only matched the plain
 * form, which turned a valid template into a false mismatch.
 */
function rhashValuesFromString(raw: string, depth = 0): string[] {
  if (depth > 3) return [];

  const decoded = decodeHtmlEntities(raw).trim();
  if (!decoded) return [];

  const found: string[] = [];

  for (const match of decoded.matchAll(/rhash(?:=|%3d)([a-f0-9]{8,64})/gi)) {
    found.push(match[1].toLowerCase());
  }

  let url: URL;

  try {
    url = new URL(decoded, EDITOR_ORIGIN);
  } catch {
    return found;
  }

  // Only inspect the official editor and Telegram share/Instant View links.
  if (
    url.hostname !== 't.me' &&
    url.hostname !== 'telegram.me' &&
    url.hostname !== 'www.telegram.me' &&
    url.origin !== EDITOR_ORIGIN
  ) {
    return found;
  }

  const direct = url.searchParams.get('rhash');
  if (direct && RHASH_VALUE.test(direct)) {
    found.push(direct.toLowerCase());
  }

  const nested = url.searchParams.get('url');
  if (nested) {
    found.push(...rhashValuesFromString(decodeParam(nested), depth + 1));
  }

  return found;
}

function extractRhashValues(html: string): string[] {
  const decoded = decodeHtmlEntities(html);
  const found = new Set<string>();

  for (const match of decoded.matchAll(/rhash(?:=|%3d)([a-f0-9]{8,64})/gi)) {
    found.add(match[1].toLowerCase());
  }

  for (const href of hrefValues(decoded)) {
    for (const value of rhashValuesFromString(href)) {
      found.add(value);
    }
  }

  return [...found];
}

/**
 * The owner account may contain templates for several domains. Only consider
 * hashes close to a `merkurov.love` occurrence so another template's hash can
 * never be compared with our production secret.
 */
function extractRhashValuesNearDomain(html: string): string[] {
  const decoded = decodeHtmlEntities(html);
  const found = new Set<string>();
  const marker = /merkurov\.love/gi;
  const windowSize = 4_000;

  for (const match of decoded.matchAll(marker)) {
    const index = match.index ?? 0;
    const window = decoded.slice(
      Math.max(0, index - windowSize),
      Math.min(decoded.length, index + windowSize)
    );

    for (const value of extractRhashValues(window)) {
      found.add(value);
    }
  }

  return [...found];
}

function safeTemplateUrl(href: string, base: string | URL = EDITOR_ORIGIN): string | null {
  const url = editorUrl(href, base);
  if (!url || !url.pathname.startsWith('/my/')) return null;

  const sanitized = new URL(url.toString());
  sanitized.searchParams.delete('rhash');
  sanitized.hash = '';

  // A nested or encoded hash must never be returned in the public status.
  if (/rhash/i.test(decodeParam(sanitized.search))) {
    sanitized.search = '';
  }

  return sanitized.toString();
}

function normalizeTrackedFlowSample(value: string): string | null {
  const direct = normalizeFlowInstantViewPageUrl(value);
  if (direct) return direct;

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;

  // Editor-tracked URLs may carry analytics parameters. The path is still the
  // canonical Flow post; strip the query before validating the public shape.
  url.search = '';
  url.hash = '';

  return normalizeFlowInstantViewPageUrl(url.toString());
}

function publicTemplateUrl(href: string, base: string | URL = EDITOR_ORIGIN): string | null {
  const url = editorUrl(href, base);
  if (!url || !url.pathname.startsWith('/my/')) return null;

  // Rebuild the URL from an allowlist. This guarantees that no unknown query
  // parameter, nested hash or editor token can slip into the owner diagnostics.
  const sanitized = new URL(`${EDITOR_ORIGIN}${url.pathname}`);
  const sample = url.searchParams.get('url');
  const canonical = sample ? normalizeTrackedFlowSample(sample) : null;
  if (canonical) sanitized.searchParams.set('url', canonical);

  return sanitized.toString();
}

function hasOtherTemplateLinks(html: string): boolean {
  for (const href of hrefValues(html)) {
    const url = editorUrl(href);
    if (!url || !url.pathname.startsWith('/my/')) continue;
    if (/^\/my\/?$/.test(url.pathname)) continue;
    if (/merkurov\.love/i.test(`${url.pathname}${decodeParam(url.search)}`)) continue;

    return true;
  }

  return false;
}

function findTemplateLinks(html: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  for (const href of hrefValues(html)) {
    const url = editorUrl(href);
    if (!url || !url.pathname.startsWith('/my/')) continue;
    if (/^\/my\/?$/.test(url.pathname)) continue;
    if (!/merkurov\.love/i.test(`${url.pathname}${decodeParam(url.search)}`)) continue;

    const sanitized = safeTemplateUrl(url.toString());
    if (!sanitized || seen.has(sanitized)) continue;

    seen.add(sanitized);
    links.push(sanitized);
  }

  return links;
}

function findTrackedFlowLinks(html: string, base: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  for (const href of hrefValues(html)) {
    const url = editorUrl(href, base);
    if (!url || !url.pathname.startsWith('/my/')) continue;

    const sample = url.searchParams.get('url');
    if (!sample) continue;

    // Rebuild the preview URL with a validated canonical Flow post only.
    const canonical = normalizeTrackedFlowSample(sample);
    if (!canonical) continue;

    const preview = new URL(url.toString());
    preview.search = '';
    preview.searchParams.set('url', canonical);
    preview.hash = '';

    const key = preview.toString();
    if (seen.has(key)) continue;

    seen.add(key);
    links.push(key);
  }

  return links;
}

function isEditorLoginPage(status: number, html: string): boolean {
  if (status === 401 || status === 403) return true;
  if (/App\.unauth\s*=\s*true/.test(html)) return true;
  if (/openPopup\('#login-popup-container'\)/.test(html)) return true;

  return false;
}

function isEditorWorkspaceHtml(status: number, html: string): boolean {
  return status === 200 && !isEditorLoginPage(status, html);
}

type EditorPage = {
  status: number;
  html: string;
  authenticated: boolean;
  unauthenticated: boolean;
};

async function fetchEditorPage(
  fetcher: typeof fetch,
  cookie: string,
  target: string
): Promise<EditorPage> {
  const initial = editorUrl(target);
  if (!initial) {
    return { status: 0, html: '', authenticated: false, unauthenticated: false };
  }

  let path = `${initial.pathname}${initial.search}`;

  for (let redirects = 0; redirects < 3; redirects += 1) {
    let response: Response;

    try {
      response = await editorFetch(fetcher, path, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          cookie,
          accept: 'text/html',
        },
      });
    } catch {
      return { status: 0, html: '', authenticated: false, unauthenticated: false };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return {
          status: response.status,
          html: '',
          authenticated: false,
          unauthenticated: false,
        };
      }

      // Follow only same-origin editor redirects. The encrypted editor cookie
      // must never be forwarded to another host by a redirect.
      const next = editorUrl(location, `${EDITOR_ORIGIN}${path}`);
      if (!next) {
        return {
          status: response.status,
          html: '',
          authenticated: false,
          unauthenticated: false,
        };
      }

      path = `${next.pathname}${next.search}`;
      continue;
    }

    const html = await response.text().catch(() => '');
    return {
      status: response.status,
      html,
      authenticated: isEditorWorkspaceHtml(response.status, html),
      unauthenticated: isEditorLoginPage(response.status, html),
    };
  }

  return { status: 0, html: '', authenticated: false, unauthenticated: false };
}

function buildTemplateState(input: {
  listingHtml: string;
  hashes: string[];
  configured: string | null;
  checkedAt: string;
  detailStatus: InstantViewTemplateDetailStatus;
  detailUrl: string | null;
}): InstantViewTemplateState {
  const uniqueHashes = [...new Set(input.hashes)];
  const rhashPresent = uniqueHashes.length > 0;
  const configured = input.configured;
  const serverHashConfigured = Boolean(configured);

  let hashStatus: InstantViewHashStatus;

  if (rhashPresent && configured) {
    hashStatus = uniqueHashes.some((value) => safeHashEqual(value, configured))
      ? 'verified'
      : 'mismatch';
  } else if (rhashPresent) {
    hashStatus = 'missing_server_hash';
  } else {
    // No editor hash means the comparison is unknown, never a mismatch.
    hashStatus = 'unknown';
  }

  return {
    templatePresent: /merkurov\.love/i.test(input.listingHtml) || Boolean(input.detailUrl),
    rhashPresent,
    hashMatchesEnv: hashStatus === 'verified' ? true : hashStatus === 'mismatch' ? false : null,
    hashStatus,
    serverHashConfigured,
    detailStatus: input.detailStatus,
    detailChecked: input.detailStatus !== 'not_attempted',
    templateUrl: input.detailUrl,
    checkedAt: input.checkedAt,
  };
}

async function inspectTemplateState(
  fetcher: typeof fetch,
  cookie: string,
  listingHtml: string,
  env: InstantViewAuthEnv,
  checkedAt: string
): Promise<InstantViewTemplateState> {
  const configured = telegramInstantViewTemplateHash(env);
  let hashes: string[] = [];
  let detailUrl: string | null = null;
  let attempted = false;
  let anyLoaded = false;
  let anyUnauthenticated = false;

  const templates = /merkurov\.love/i.test(listingHtml)
    ? findTemplateLinks(listingHtml).slice(0, MAX_TEMPLATE_DETAIL_PAGES)
    : [];

  if (templates.length) {
    for (const template of templates) {
      attempted = true;
      const page = await fetchEditorPage(fetcher, cookie, template);

      if (!page.authenticated) {
        anyUnauthenticated = anyUnauthenticated || page.unauthenticated;
        continue;
      }

      anyLoaded = true;
      detailUrl = detailUrl ?? publicTemplateUrl(template);

      const pageHashes = extractRhashValues(page.html);
      if (pageHashes.length) {
        hashes = pageHashes;
        break;
      }

      const previews = findTrackedFlowLinks(page.html, template).slice(
        0,
        MAX_TEMPLATE_PREVIEW_PAGES
      );

      for (const preview of previews) {
        attempted = true;
        const previewPage = await fetchEditorPage(fetcher, cookie, preview);

        if (!previewPage.authenticated) {
          anyUnauthenticated = anyUnauthenticated || previewPage.unauthenticated;
          continue;
        }

        anyLoaded = true;
        detailUrl = detailUrl ?? publicTemplateUrl(preview);

        const previewHashes = extractRhashValues(previewPage.html);
        if (previewHashes.length) {
          hashes = previewHashes;
          break;
        }
      }

      if (hashes.length) break;
    }
  }

  // Only a hash near the merkurov.love row may be used as a fallback, and only
  // when there is no detail page to inspect. Hashes from another owner
  // template must never be compared with our secret.
  if (!hashes.length && !templates.length && !hasOtherTemplateLinks(listingHtml)) {
    hashes = extractRhashValuesNearDomain(listingHtml);
  }

  const detailStatus: InstantViewTemplateDetailStatus = anyLoaded
    ? 'loaded'
    : anyUnauthenticated
      ? 'unauthenticated'
      : attempted
        ? 'unavailable'
        : 'not_attempted';

  return buildTemplateState({
    listingHtml,
    hashes,
    configured,
    checkedAt,
    detailStatus,
    // Keep a sanitized link to the template even when the hash was already
    // available on the listing page.
    detailUrl: detailUrl ?? publicTemplateUrl(findTemplateLinks(listingHtml)[0] ?? '') ?? null,
  });
}

function pendingExpired(state: InstantViewSessionState, now: number): boolean {
  if (!state.pendingExpiresAt) return false;
  const expires = Date.parse(state.pendingExpiresAt);
  return !Number.isFinite(expires) || expires <= now;
}

function sanitizedStatus(
  state: InstantViewSessionState,
  storage: 'available' | 'unavailable',
  env: InstantViewAuthEnv
): InstantViewPublicStatus {
  return {
    status: state.status,
    storage,
    keySource: instantViewSessionKeySource(),
    hashConfigured: Boolean(telegramInstantViewTemplateHash(env)),
    pendingExpiresAt: state.pendingExpiresAt,
    connectedAt: state.connectedAt,
    lastVerifiedAt: state.lastVerifiedAt,
    lastErrorCode: state.lastErrorCode,
    // Re-sanitize a persisted URL so an older row can never return a hash.
    template: state.template
      ? {
          ...state.template,
          templateUrl: state.template.templateUrl
            ? publicTemplateUrl(state.template.templateUrl)
            : null,
        }
      : null,
  };
}

function sealSessionSecret(value: string) {
  try {
    return sealInstantViewSecret(value);
  } catch {
    throw new InstantViewStorageError(
      'Instant View session encryption is not configured on the server.'
    );
  }
}

export async function startInstantViewLogin(
  phone: unknown,
  deps: InstantViewAuthDeps = {}
): Promise<{ status: 'pending'; expiresAt: string }> {
  const { fetcher, store, now } = depsWithDefaults(deps);
  const normalized = normalizeInstantViewPhone(phone);

  if (!normalized) {
    throw new InstantViewAuthError(
      'invalid_phone',
      'Enter a phone number in international format.'
    );
  }

  let response: Response;

  try {
    response = await editorFetch(fetcher, '/auth/request', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: EDITOR_ORIGIN,
        referer: `${EDITOR_ORIGIN}/auth`,
      },
      body: formBody({ phone: normalized }),
    });
  } catch {
    throw new InstantViewAuthError(
      'login_request_failed',
      'Telegram did not accept the login request.'
    );
  }

  const data = await readJson(response);
  const tempSession =
    typeof data === 'object' && data !== null && 'temp_session' in data
      ? (data as { temp_session?: unknown }).temp_session
      : null;

  if (!response.ok || typeof tempSession !== 'string' || !tempSession.trim()) {
    throw new InstantViewAuthError(
      'login_request_failed',
      'Telegram did not accept the login request.'
    );
  }

  const previous = await store.read();
  const expiresAt = new Date(now() + PENDING_TTL_MS).toISOString();
  const next: InstantViewSessionState = {
    ...previous,
    version: 1,
    status: 'pending',
    pending: sealSessionSecret(tempSession.trim()),
    pendingExpiresAt: expiresAt,
    lastErrorCode: null,
  };

  await store.write(next);

  return { status: 'pending', expiresAt };
}

export async function checkInstantViewLogin(
  deps: InstantViewAuthDeps = {}
): Promise<InstantViewPublicStatus> {
  const { fetcher, store, now, env } = depsWithDefaults(deps);
  const state = await store.read();

  if (state.status !== 'pending' || !state.pending) {
    return sanitizedStatus(state, 'available', env);
  }

  if (pendingExpired(state, now())) {
    const next: InstantViewSessionState = {
      ...state,
      status: state.cookie ? 'connected' : 'error',
      pending: null,
      pendingExpiresAt: null,
      lastErrorCode: 'login_expired',
    };
    await store.write(next);
    return sanitizedStatus(next, 'available', env);
  }

  const tempSession = openInstantViewSecret(state.pending);
  if (!tempSession) {
    const next: InstantViewSessionState = {
      ...state,
      status: state.cookie ? 'connected' : 'error',
      pending: null,
      pendingExpiresAt: null,
      lastErrorCode: 'session_unreadable',
    };
    await store.write(next);
    return sanitizedStatus(next, 'available', env);
  }

  let response: Response;

  try {
    response = await editorFetch(fetcher, '/auth/login', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: EDITOR_ORIGIN,
        referer: `${EDITOR_ORIGIN}/auth`,
      },
      body: formBody({ temp_session: tempSession }),
    });
  } catch {
    throw new InstantViewAuthError('login_check_failed', 'Telegram login check failed.');
  }

  if (!response.ok) {
    throw new InstantViewAuthError('login_check_failed', 'Telegram login check failed.');
  }

  const data = await readJson(response);
  const confirmed =
    data !== null &&
    data !== false &&
    (typeof data === 'object'
      ? Object.keys(data as Record<string, unknown>).length > 0
      : Boolean(data));

  if (!confirmed) {
    return sanitizedStatus(state, 'available', env);
  }

  const cookie = sessionCookies(response);
  if (!cookie) {
    const next: InstantViewSessionState = {
      ...state,
      status: 'error',
      pending: null,
      pendingExpiresAt: null,
      lastErrorCode: 'session_cookie_missing',
    };
    await store.write(next);
    return sanitizedStatus(next, 'available', env);
  }

  const verified = await verifyEditorCookie(fetcher, cookie);
  if (!verified.ok) {
    const next: InstantViewSessionState = {
      ...state,
      status: 'error',
      pending: null,
      pendingExpiresAt: null,
      lastErrorCode: 'session_verification_failed',
    };
    await store.write(next);
    return sanitizedStatus(next, 'available', env);
  }

  const timestamp = new Date(now()).toISOString();
  const next: InstantViewSessionState = {
    ...state,
    status: 'connected',
    cookie: sealSessionSecret(cookie),
    pending: null,
    pendingExpiresAt: null,
    connectedAt: timestamp,
    lastVerifiedAt: timestamp,
    lastErrorCode: null,
  };
  await store.write(next);

  return sanitizedStatus(next, 'available', env);
}

export async function verifyInstantViewSession(
  deps: InstantViewAuthDeps = {}
): Promise<InstantViewPublicStatus> {
  const { fetcher, store, now, env } = depsWithDefaults(deps);
  const state = await store.read();

  if (!state.cookie) {
    return sanitizedStatus(state, 'available', env);
  }

  const cookie = openInstantViewSecret(state.cookie);
  if (!cookie) {
    const next: InstantViewSessionState = {
      ...state,
      status: 'error',
      cookie: null,
      lastErrorCode: 'session_unreadable',
    };
    await store.write(next);
    return sanitizedStatus(next, 'available', env);
  }

  const verified = await verifyEditorCookie(fetcher, cookie);
  const timestamp = new Date(now()).toISOString();

  if (!verified.ok) {
    const next: InstantViewSessionState = {
      ...state,
      status: 'error',
      cookie: null,
      lastErrorCode: 'session_expired',
      template: null,
    };
    await store.write(next);
    return sanitizedStatus(next, 'available', env);
  }

  const next: InstantViewSessionState = {
    ...state,
    status: 'connected',
    lastVerifiedAt: timestamp,
    lastErrorCode: null,
  };
  await store.write(next);

  return sanitizedStatus(next, 'available', env);
}

export async function inspectInstantViewEditor(
  deps: InstantViewAuthDeps = {}
): Promise<InstantViewPublicStatus> {
  const { fetcher, store, now, env } = depsWithDefaults(deps);
  const state = await store.read();

  if (state.status !== 'connected' || !state.cookie) {
    return sanitizedStatus(state, 'available', env);
  }

  const cookie = openInstantViewSecret(state.cookie);
  if (!cookie) {
    const next: InstantViewSessionState = {
      ...state,
      status: 'error',
      cookie: null,
      lastErrorCode: 'session_unreadable',
    };
    await store.write(next);
    return sanitizedStatus(next, 'available', env);
  }

  const verified = await verifyEditorCookie(fetcher, cookie);
  const timestamp = new Date(now()).toISOString();

  if (!verified.ok || !verified.html) {
    const next: InstantViewSessionState = {
      ...state,
      status: 'error',
      cookie: null,
      lastErrorCode: 'session_expired',
      template: null,
    };
    await store.write(next);
    return sanitizedStatus(next, 'available', env);
  }

  const template = await inspectTemplateState(fetcher, cookie, verified.html, env, timestamp);
  const next: InstantViewSessionState = {
    ...state,
    status: 'connected',
    lastVerifiedAt: timestamp,
    lastErrorCode: null,
    template,
  };
  await store.write(next);

  return sanitizedStatus(next, 'available', env);
}

export async function disconnectInstantViewSession(
  deps: InstantViewAuthDeps = {}
): Promise<InstantViewPublicStatus> {
  const { store, env } = depsWithDefaults(deps);
  const next = emptyInstantViewSessionState();
  await store.write(next);

  return sanitizedStatus(next, 'available', env);
}

export async function loadInstantViewStatus(
  deps: InstantViewAuthDeps = {}
): Promise<InstantViewPublicStatus> {
  const { store, env } = depsWithDefaults(deps);

  try {
    const state = await store.read();
    return sanitizedStatus(state, 'available', env);
  } catch (error) {
    if (error instanceof InstantViewStorageError) {
      return sanitizedStatus(emptyInstantViewSessionState(), 'unavailable', env);
    }

    throw error;
  }
}

/**
 * Server-only worker accessor. The returned cookie must never cross an HTTP
 * response, a log line or a client bundle boundary.
 */
export async function readInstantViewSessionCookie(
  deps: InstantViewAuthDeps = {}
): Promise<{ cookie: string; fingerprint: string } | null> {
  const { store } = depsWithDefaults(deps);
  const state = await store.read();

  if (state.status !== 'connected' || !state.cookie) return null;

  const cookie = openInstantViewSecret(state.cookie);
  if (!cookie) return null;

  return { cookie, fingerprint: instantViewFingerprint(cookie) };
}
