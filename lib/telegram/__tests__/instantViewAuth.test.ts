/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  checkInstantViewLogin,
  disconnectInstantViewSession,
  inspectInstantViewEditor,
  InstantViewAuthError,
  loadInstantViewStatus,
  normalizeInstantViewPhone,
  readInstantViewSessionCookie,
  startInstantViewLogin,
  verifyInstantViewSession,
} from '../instantViewAuth';
import {
  emptyInstantViewSessionState,
  InstantViewStorageError,
  type InstantViewSessionState,
  type InstantViewSessionStore,
} from '../instantViewSessionStore';

const originalEnv = { ...process.env };
const PHONE = '+79001234567';
const TEMP_SESSION = 'temporary-editor-login-token';
const EDITOR_COOKIE = '__Host-iv_session=editor-cookie-secret-123';
const HASH = '0b7348f6c3561b';

class MemoryStore implements InstantViewSessionStore {
  state: InstantViewSessionState = emptyInstantViewSessionState();
  writes = 0;

  async read() {
    return structuredClone(this.state);
  }

  async write(next: InstantViewSessionState) {
    this.state = structuredClone(next);
    this.writes += 1;
  }
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function json(body: unknown, setCookie?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (setCookie) headers.append('set-cookie', setCookie);

  return new Response(JSON.stringify(body), { status: 200, headers });
}

function authenticatedHtml(extra = '') {
  return `<!doctype html><html><body>
    <nav><a href="/my/">My Templates</a></nav>
    <a href="/my/merkurov.love?url=https://www.merkurov.love/flow/example&amp;rhash=${HASH}">merkurov.love</a>
    ${extra}
  </body></html>`;
}

function unauthenticatedHtml() {
  return `<!doctype html><html><body>
    <script>App.unauth = true;</script>
    <div id="login-popup-container"></div>
    <script>openPopup('#login-popup-container');</script>
  </body></html>`;
}

type Call = { url: string; init?: RequestInit };

function mockFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetcher = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;

  return { fetcher, calls };
}

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY = 'instant-view-auth-test-key';
  delete process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY_PREVIOUS;
  delete process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH;
  delete process.env.TELEGRAM_INSTANT_VIEW_HASH;
});

afterEach(() => {
  process.env = { ...originalEnv };
  jest.restoreAllMocks();
});

describe('Instant View phone normalization', () => {
  it.each([
    ['+7 900 123-45-67', '+79001234567'],
    [' +44 (20) 7946-0958 ', '+442079460958'],
  ])('normalizes %p', (input, expected) => {
    expect(normalizeInstantViewPhone(input)).toBe(expected);
  });

  it.each([
    '',
    '89001234567',
    '+01234567',
    '+7',
    '+7900123456789012',
    '+7 900 123-45-67 ext 1',
    null,
    42,
  ])('rejects %p', (input) => {
    expect(normalizeInstantViewPhone(input)).toBeNull();
  });
});

describe('official Instant View editor authorization', () => {
  it('starts the official login request without persisting the phone or temp session in plaintext', async () => {
    const store = new MemoryStore();
    const { fetcher, calls } = mockFetch(() => json({ temp_session: TEMP_SESSION }));

    const result = await startInstantViewLogin(PHONE, {
      fetch: fetcher,
      store,
      now: () => Date.parse('2026-11-28T10:00:00Z'),
    });

    expect(result.status).toBe('pending');
    expect(result.expiresAt).toBe('2026-11-28T10:10:00.000Z');
    expect(calls[0].url).toBe('https://instantview.telegram.org/auth/request');
    expect(String(calls[0].init?.body)).toContain(`phone=${encodeURIComponent(PHONE)}`);
    expect(store.state.status).toBe('pending');
    expect(store.state.pending).not.toBeNull();

    const persisted = JSON.stringify(store.state);
    expect(persisted).not.toContain(PHONE);
    expect(persisted).not.toContain(TEMP_SESSION);
    expect(persisted).toContain('ciphertext');
  });

  it('rejects a malformed phone before calling Telegram', async () => {
    const { fetcher, calls } = mockFetch(() => json({ temp_session: TEMP_SESSION }));

    await expect(
      startInstantViewLogin('not-a-phone', { fetch: fetcher, store: new MemoryStore() })
    ).rejects.toMatchObject({ code: 'invalid_phone' });
    expect(calls).toHaveLength(0);
  });

  it('keeps the flow pending while the owner has not confirmed in Telegram', async () => {
    const store = new MemoryStore();
    store.state = {
      ...emptyInstantViewSessionState(),
      status: 'pending',
      pending: (await import('../instantViewSessionCrypto')).sealInstantViewSecret(TEMP_SESSION),
      pendingExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const { fetcher, calls } = mockFetch(() => json(null));

    const status = await checkInstantViewLogin({ fetch: fetcher, store });

    expect(status.status).toBe('pending');
    expect(store.state.cookie).toBeNull();
    expect(calls[0].url).toBe('https://instantview.telegram.org/auth/login');
    expect(String(calls[0].init?.body)).toContain(
      `temp_session=${encodeURIComponent(TEMP_SESSION)}`
    );
  });

  it('stores a confirmed editor session encrypted and reports connected', async () => {
    const store = new MemoryStore();
    store.state = {
      ...emptyInstantViewSessionState(),
      status: 'pending',
      pending: (await import('../instantViewSessionCrypto')).sealInstantViewSecret(TEMP_SESSION),
      pendingExpiresAt: '2026-11-28T10:05:30.000Z',
    };
    const { fetcher, calls } = mockFetch((call) => {
      if (call.url.endsWith('/auth/login')) {
        return json({ id: 1 }, `${EDITOR_COOKIE}; Path=/; HttpOnly; Secure; SameSite=Lax`);
      }
      return html(authenticatedHtml());
    });

    const status = await checkInstantViewLogin({
      fetch: fetcher,
      store,
      now: () => Date.parse('2026-11-28T10:05:00Z'),
    });

    expect(status.status).toBe('connected');
    expect(status.connectedAt).toBe('2026-11-28T10:05:00.000Z');
    expect(store.state.cookie).not.toBeNull();
    expect(JSON.stringify(store.state)).not.toContain('editor-cookie-secret-123');
    expect(calls.map((call) => call.url)).toEqual([
      'https://instantview.telegram.org/auth/login',
      'https://instantview.telegram.org/my/',
    ]);
    expect(calls[1].init?.headers).toMatchObject({ cookie: EDITOR_COOKIE });
  });

  it('rejects a login response without a session cookie', async () => {
    const store = new MemoryStore();
    store.state = {
      ...emptyInstantViewSessionState(),
      status: 'pending',
      pending: (await import('../instantViewSessionCrypto')).sealInstantViewSecret(TEMP_SESSION),
      pendingExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const { fetcher } = mockFetch(() => json({ id: 1 }));

    const status = await checkInstantViewLogin({ fetch: fetcher, store });

    expect(status.status).toBe('error');
    expect(status.lastErrorCode).toBe('session_cookie_missing');
    expect(store.state.cookie).toBeNull();
  });

  it('rejects a cookie that Telegram does not treat as an authenticated editor session', async () => {
    const store = new MemoryStore();
    store.state = {
      ...emptyInstantViewSessionState(),
      status: 'pending',
      pending: (await import('../instantViewSessionCrypto')).sealInstantViewSecret(TEMP_SESSION),
      pendingExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const { fetcher } = mockFetch((call) => {
      if (call.url.endsWith('/auth/login')) {
        return json({ id: 1 }, `${EDITOR_COOKIE}; Path=/; HttpOnly; Secure`);
      }
      return html(unauthenticatedHtml());
    });

    const status = await checkInstantViewLogin({ fetch: fetcher, store });

    expect(status.status).toBe('error');
    expect(status.lastErrorCode).toBe('session_verification_failed');
  });

  it('expires a stale pending confirmation without claiming success', async () => {
    const store = new MemoryStore();
    store.state = {
      ...emptyInstantViewSessionState(),
      status: 'pending',
      pending: (await import('../instantViewSessionCrypto')).sealInstantViewSecret(TEMP_SESSION),
      pendingExpiresAt: '2026-11-28T09:00:00.000Z',
    };
    const { fetcher, calls } = mockFetch(() => json({ id: 1 }));

    const status = await checkInstantViewLogin({
      fetch: fetcher,
      store,
      now: () => Date.parse('2026-11-28T10:00:00Z'),
    });

    expect(status.status).toBe('error');
    expect(status.lastErrorCode).toBe('login_expired');
    expect(calls).toHaveLength(0);
  });

  it('verifies an existing session and clears it when the editor rejects it', async () => {
    const store = new MemoryStore();
    const { sealInstantViewSecret } = await import('../instantViewSessionCrypto');
    store.state = {
      ...emptyInstantViewSessionState(),
      status: 'connected',
      cookie: sealInstantViewSecret(EDITOR_COOKIE),
      connectedAt: '2026-11-28T09:00:00.000Z',
    };
    const { fetcher } = mockFetch(() => html(unauthenticatedHtml()));

    const status = await verifyInstantViewSession({ fetch: fetcher, store });

    expect(status.status).toBe('error');
    expect(status.lastErrorCode).toBe('session_expired');
    expect(store.state.cookie).toBeNull();
  });

  it('inspects the editor, confirms the real rhash and never returns it', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const store = new MemoryStore();
    const { sealInstantViewSecret } = await import('../instantViewSessionCrypto');
    store.state = {
      ...emptyInstantViewSessionState(),
      status: 'connected',
      cookie: sealInstantViewSecret(EDITOR_COOKIE),
      connectedAt: '2026-11-28T09:00:00.000Z',
    };
    const page = authenticatedHtml(
      `<a href="https://t.me/iv?url=https%3A%2F%2Fwww.merkurov.love%2Fflow%2Fexample&rhash=${HASH}">View in Telegram</a>`
    );
    const { fetcher } = mockFetch(() => html(page));

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });
    const serialized = JSON.stringify(status);

    expect(status.status).toBe('connected');
    expect(status.template?.templatePresent).toBe(true);
    expect(status.template?.rhashPresent).toBe(true);
    expect(status.template?.hashMatchesEnv).toBe(true);
    expect(status.template?.templateUrl).not.toContain(HASH);
    expect(serialized).not.toContain(HASH);
    expect(serialized).not.toContain('rhash=');
    expect(serialized).not.toContain('editor-cookie-secret-123');
  });

  it('reports a hash mismatch without exposing either hash', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = 'aaaaaaaaaaaaaaaa';
    const store = new MemoryStore();
    const { sealInstantViewSecret } = await import('../instantViewSessionCrypto');
    store.state = {
      ...emptyInstantViewSessionState(),
      status: 'connected',
      cookie: sealInstantViewSecret(EDITOR_COOKIE),
      connectedAt: '2026-11-28T09:00:00.000Z',
    };
    const page = authenticatedHtml(
      `<a href="https://t.me/iv?url=https%3A%2F%2Fwww.merkurov.love%2Fflow%2Fexample&rhash=${HASH}">View in Telegram</a>`
    );
    const { fetcher } = mockFetch(() => html(page));

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });
    const serialized = JSON.stringify(status);

    expect(status.template?.hashMatchesEnv).toBe(false);
    expect(serialized).not.toContain(HASH);
    expect(serialized).not.toContain('aaaaaaaaaaaaaaaa');
  });

  it('disconnects and removes the stored cookie', async () => {
    const store = new MemoryStore();
    const { sealInstantViewSecret } = await import('../instantViewSessionCrypto');
    store.state = {
      ...emptyInstantViewSessionState(),
      status: 'connected',
      cookie: sealInstantViewSecret(EDITOR_COOKIE),
    };

    const status = await disconnectInstantViewSession({ store });

    expect(status.status).toBe('disconnected');
    expect(store.state.cookie).toBeNull();
    expect(store.state.status).toBe('disconnected');
  });

  it('reports storage as unavailable instead of crashing the admin page', async () => {
    const store: InstantViewSessionStore = {
      async read() {
        throw new InstantViewStorageError();
      },
      async write() {
        throw new InstantViewStorageError();
      },
    };

    const status = await loadInstantViewStatus({ store });

    expect(status.status).toBe('disconnected');
    expect(status.storage).toBe('unavailable');
  });

  it('exposes the cookie only to a server-side worker accessor', async () => {
    const store = new MemoryStore();
    const { sealInstantViewSecret } = await import('../instantViewSessionCrypto');
    store.state = {
      ...emptyInstantViewSessionState(),
      status: 'connected',
      cookie: sealInstantViewSecret(EDITOR_COOKIE),
    };

    const session = await readInstantViewSessionCookie({ store });

    expect(session?.cookie).toBe(EDITOR_COOKIE);
    expect(session?.fingerprint).toMatch(/^[a-f0-9]{12}$/);
  });

  it('does not leak credentials into logs on failure', async () => {
    const store = new MemoryStore();
    store.state = {
      ...emptyInstantViewSessionState(),
      status: 'pending',
      pending: (await import('../instantViewSessionCrypto')).sealInstantViewSecret(TEMP_SESSION),
      pendingExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined)
    );
    const { fetcher } = mockFetch(() => {
      throw new Error('network down');
    });

    await expect(checkInstantViewLogin({ fetch: fetcher, store })).rejects.toMatchObject({
      code: 'login_check_failed',
    });

    const output = spies
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .map((value) => (typeof value === 'string' ? value : ''))
      .join('\n');

    expect(output).not.toContain(TEMP_SESSION);
    expect(output).not.toContain(EDITOR_COOKIE);
  });
});

describe('Instant View auth error surface', () => {
  it('uses stable non-secret error codes', () => {
    const error = new InstantViewAuthError('login_check_failed');
    expect(error.code).toBe('login_check_failed');
    expect(error.message).not.toMatch(/cookie|token|session=/i);
  });
});
