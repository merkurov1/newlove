import crypto from 'node:crypto';

import { assertServerOnly } from '@/lib/serverOnly';
import { telegramInstantViewTemplateHash } from '@/lib/telegram/instantView';

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
  type InstantViewSessionState,
  type InstantViewSessionStore,
  type InstantViewTemplateState,
} from './instantViewSessionStore';

assertServerOnly('lib/telegram/instantViewAuth');

const EDITOR_ORIGIN = 'https://instantview.telegram.org';
const REQUEST_TIMEOUT_MS = 15_000;
const PENDING_TTL_MS = 10 * 60 * 1000;
const USER_AGENT = 'merkurov.love Instant View admin session/1.0 (+https://www.merkurov.love)';

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

function parseTemplateState(
  html: string,
  env: InstantViewAuthEnv,
  checkedAt: string
): InstantViewTemplateState {
  const hashes = Array.from(html.matchAll(/[?&]rhash=([a-f0-9]{8,64})/gi), (match) =>
    match[1].toLowerCase()
  );
  const configured = telegramInstantViewTemplateHash(env);
  const hashMatchesEnv =
    configured && hashes.length
      ? hashes.some((value) => safeHashEqual(value, configured))
      : hashes.length
        ? false
        : configured
          ? false
          : null;

  const templateHref = html.match(/href="([^"]*(?:my\/|template)[^"]*merkurov\.love[^"]*)"/i)?.[1];

  let templateUrl: string | null = null;
  if (templateHref) {
    try {
      const url = new URL(templateHref.replace(/&amp;/g, '&'), EDITOR_ORIGIN);
      // Never return a URL that carries the editor hash.
      url.searchParams.delete('rhash');
      templateUrl = url.toString();
    } catch {
      templateUrl = null;
    }
  }

  return {
    templatePresent: /merkurov\.love/i.test(html),
    rhashPresent: hashes.length > 0,
    hashMatchesEnv,
    templateUrl,
    checkedAt,
  };
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
    template: state.template,
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

  const template = parseTemplateState(verified.html, env, timestamp);
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
