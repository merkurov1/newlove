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

/** A listing that only links to the template and does not expose a hash. */
function listingWithoutRhash(extra = '') {
  return `<!doctype html><html><body>
    <nav><a href="/my/">My Templates</a></nav>
    <a href="/my/merkurov.love/">merkurov.love</a>
    ${extra}
  </body></html>`;
}

/** The template detail page lists tracked sample URLs, still without a hash. */
function detailWithTrackedFlow() {
  return `<!doctype html><html><body>
    <nav><a href="/my/">My Templates</a></nav>
    <section data-section="merkurov.love">
      <a href="/my/merkurov.love/?url=https%3A%2F%2Fwww.merkurov.love%2Fflow%2Fexample">
        https://www.merkurov.love/flow/example
      </a>
    </section>
  </body></html>`;
}

/** The real editor workspace exposes the hash inside the Telegram share link. */
function workspaceWithShareHash(hash: string) {
  return `<!doctype html><html><body>
    <nav><a href="/my/">My Templates</a></nav>
    <a
      href="https://t.me/share/url?url=https%3A%2F%2Ft.me%2Fiv%3Furl%3Dhttps%253A%252F%252Fwww.merkurov.love%252Fflow%252Fexample%26rhash%3D${hash}"
      target="_blank"
      id="url-share"
      class="btn btn-link btn-lg disabled"
    >View in Telegram</a>
  </body></html>`;
}

async function connectStore(store: MemoryStore) {
  const { sealInstantViewSecret } = await import('../instantViewSessionCrypto');
  store.state = {
    ...emptyInstantViewSessionState(),
    status: 'connected',
    cookie: sealInstantViewSecret(EDITOR_COOKIE),
    connectedAt: '2026-11-28T09:00:00.000Z',
  };
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
    await connectStore(store);
    const page = authenticatedHtml(
      `<a href="https://t.me/iv?url=https%3A%2F%2Fwww.merkurov.love%2Fflow%2Fexample&rhash=${HASH}">View in Telegram</a>`
    );
    const { fetcher } = mockFetch(() => html(page));

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });
    const serialized = JSON.stringify(status);

    expect(status.status).toBe('connected');
    expect(status.template?.templatePresent).toBe(true);
    expect(status.template?.rhashPresent).toBe(true);
    expect(status.template?.hashStatus).toBe('verified');
    expect(status.template?.serverHashConfigured).toBe(true);
    expect(status.template?.hashMatchesEnv).toBe(true);
    expect(status.template?.templateUrl).not.toContain(HASH);
    expect(serialized).not.toContain(HASH);
    expect(serialized).not.toContain('rhash=');
    expect(serialized).not.toContain('editor-cookie-secret-123');
  });

  it('follows the listing detail/preview and finds an encoded share-link rhash', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const store = new MemoryStore();
    await connectStore(store);
    const { fetcher, calls } = mockFetch((call) => {
      if (call.url === 'https://instantview.telegram.org/my/') {
        return html(listingWithoutRhash());
      }
      if (call.url === 'https://instantview.telegram.org/my/merkurov.love/') {
        return html(detailWithTrackedFlow());
      }
      if (call.url.includes('/my/merkurov.love/?url=')) {
        return html(workspaceWithShareHash(HASH));
      }
      return html('<html><body>Not found</body></html>', 404);
    });

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });
    const serialized = JSON.stringify(status);

    expect(status.status).toBe('connected');
    expect(status.template?.templatePresent).toBe(true);
    expect(status.template?.rhashPresent).toBe(true);
    expect(status.template?.hashStatus).toBe('verified');
    expect(status.template?.hashMatchesEnv).toBe(true);
    expect(status.template?.detailStatus).toBe('loaded');
    expect(status.template?.detailChecked).toBe(true);
    expect(calls.map((call) => call.url)).toEqual([
      'https://instantview.telegram.org/my/',
      'https://instantview.telegram.org/my/merkurov.love/',
      'https://instantview.telegram.org/my/merkurov.love/?url=https%3A%2F%2Fwww.merkurov.love%2Fflow%2Fexample',
    ]);
    expect(serialized).not.toContain(HASH);
    expect(serialized).not.toContain('rhash=');
    expect(serialized).not.toContain('%3D');
    expect(serialized).not.toContain('editor-cookie-secret-123');
  });

  it('normalizes an editor-tracked Flow URL with analytics parameters', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const store = new MemoryStore();
    await connectStore(store);
    const { fetcher, calls } = mockFetch((call) => {
      if (call.url === 'https://instantview.telegram.org/my/') {
        return html(listingWithoutRhash());
      }
      if (call.url === 'https://instantview.telegram.org/my/merkurov.love/') {
        return html(
          `<html><body>
            <nav><a href="/my/">My Templates</a></nav>
            <a href="/my/merkurov.love/?url=https%3A%2F%2Fwww.merkurov.love%2Fflow%2Fexample%3Futm_source%3Dtg">
              tracked
            </a>
          </body></html>`
        );
      }
      return html(workspaceWithShareHash(HASH));
    });

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });

    expect(status.template?.hashStatus).toBe('verified');
    expect(status.template?.templateUrl).toBe('https://instantview.telegram.org/my/merkurov.love/');
    expect(calls.map((call) => call.url)).toContain(
      'https://instantview.telegram.org/my/merkurov.love/?url=https%3A%2F%2Fwww.merkurov.love%2Fflow%2Fexample'
    );
  });

  it('reports a hash mismatch without exposing either hash', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = 'aaaaaaaaaaaaaaaa';
    const store = new MemoryStore();
    await connectStore(store);
    const page = authenticatedHtml(
      `<a href="https://t.me/iv?url=https%3A%2F%2Fwww.merkurov.love%2Fflow%2Fexample&rhash=${HASH}">View in Telegram</a>`
    );
    const { fetcher } = mockFetch(() => html(page));

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });
    const serialized = JSON.stringify(status);

    expect(status.template?.hashStatus).toBe('mismatch');
    expect(status.template?.hashMatchesEnv).toBe(false);
    expect(serialized).not.toContain(HASH);
    expect(serialized).not.toContain('aaaaaaaaaaaaaaaa');
  });

  it('reports a missing server hash instead of a mismatch', async () => {
    delete process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH;
    const store = new MemoryStore();
    await connectStore(store);
    const page = authenticatedHtml(
      `<a href="https://t.me/iv?url=https%3A%2F%2Fwww.merkurov.love%2Fflow%2Fexample&rhash=${HASH}">View in Telegram</a>`
    );
    const { fetcher } = mockFetch(() => html(page));

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });

    expect(status.template?.rhashPresent).toBe(true);
    expect(status.template?.serverHashConfigured).toBe(false);
    expect(status.template?.hashStatus).toBe('missing_server_hash');
    expect(status.template?.hashMatchesEnv).toBeNull();
  });

  it('returns unknown, not a false mismatch, when the detail page has no hash', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const store = new MemoryStore();
    await connectStore(store);
    const { fetcher } = mockFetch((call) => {
      if (call.url === 'https://instantview.telegram.org/my/') {
        return html(listingWithoutRhash());
      }
      if (call.url === 'https://instantview.telegram.org/my/merkurov.love/') {
        return html(detailWithTrackedFlow());
      }
      return html('<html><body>No hash here.</body></html>');
    });

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });

    expect(status.status).toBe('connected');
    expect(status.template?.templatePresent).toBe(true);
    expect(status.template?.rhashPresent).toBe(false);
    expect(status.template?.hashStatus).toBe('unknown');
    expect(status.template?.hashMatchesEnv).toBeNull();
    expect(status.template?.detailStatus).toBe('loaded');
  });

  it('never compares another template hash from the same owner listing', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const otherHash = 'deadbeefdeadbeef';
    const store = new MemoryStore();
    await connectStore(store);
    const { fetcher } = mockFetch((call) => {
      if (call.url === 'https://instantview.telegram.org/my/') {
        return html(
          listingWithoutRhash(
            `<a href="/my/other.example/?url=https%3A%2F%2Fother.example%2Fpost&amp;rhash=${otherHash}">other.example</a>`
          )
        );
      }
      if (call.url === 'https://instantview.telegram.org/my/merkurov.love/') {
        return html(detailWithTrackedFlow());
      }
      return html('<html><body>No hash here.</body></html>');
    });

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });

    expect(status.template?.rhashPresent).toBe(false);
    expect(status.template?.hashStatus).toBe('unknown');
    expect(status.template?.hashMatchesEnv).toBeNull();
  });

  it('keeps the session and reports unknown when the template detail is unavailable', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const store = new MemoryStore();
    await connectStore(store);
    const { fetcher } = mockFetch((call) => {
      if (call.url === 'https://instantview.telegram.org/my/') {
        return html(listingWithoutRhash());
      }
      throw new Error('detail network failure');
    });

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });

    expect(status.status).toBe('connected');
    expect(status.template?.hashStatus).toBe('unknown');
    expect(status.template?.hashMatchesEnv).toBeNull();
    expect(status.template?.detailStatus).toBe('unavailable');
    expect(store.state.status).toBe('connected');
    expect(store.state.cookie).not.toBeNull();
  });

  it('reports an unauthenticated detail page without clearing the valid listing session', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const store = new MemoryStore();
    await connectStore(store);
    const { fetcher } = mockFetch((call) => {
      if (call.url === 'https://instantview.telegram.org/my/') {
        return html(listingWithoutRhash());
      }
      return html(unauthenticatedHtml());
    });

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });

    expect(status.status).toBe('connected');
    expect(status.template?.hashStatus).toBe('unknown');
    expect(status.template?.detailStatus).toBe('unauthenticated');
    expect(store.state.cookie).not.toBeNull();
  });

  it('does not follow a foreign host disguised as a template link', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const store = new MemoryStore();
    await connectStore(store);
    const { fetcher, calls } = mockFetch(() =>
      html(
        `<!doctype html><html><body>
          <nav><a href="/my/">My Templates</a></nav>
          <a href="https://evil.example/my/merkurov.love/">merkurov.love</a>
        </body></html>`
      )
    );

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });

    expect(status.template?.hashStatus).toBe('unknown');
    expect(status.template?.detailStatus).toBe('not_attempted');
    expect(calls.map((call) => call.url)).toEqual(['https://instantview.telegram.org/my/']);
  });

  it('never forwards the editor cookie through a cross-origin redirect', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const store = new MemoryStore();
    await connectStore(store);
    const { fetcher, calls } = mockFetch((call) => {
      if (call.url === 'https://instantview.telegram.org/my/') {
        return html(listingWithoutRhash());
      }
      return new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example/steal' },
      });
    });

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });

    expect(status.template?.hashStatus).toBe('unknown');
    expect(status.template?.detailStatus).toBe('unavailable');
    expect(calls.map((call) => call.url)).toEqual([
      'https://instantview.telegram.org/my/',
      'https://instantview.telegram.org/my/merkurov.love/',
    ]);
    expect(store.state.cookie).not.toBeNull();
  });

  it('clears an expired editor session when inspecting', async () => {
    const store = new MemoryStore();
    await connectStore(store);
    const { fetcher, calls } = mockFetch(() => html(unauthenticatedHtml()));

    const status = await inspectInstantViewEditor({ fetch: fetcher, store });

    expect(status.status).toBe('error');
    expect(status.lastErrorCode).toBe('session_expired');
    expect(status.template).toBeNull();
    expect(store.state.cookie).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('re-sanitizes a legacy stored templateUrl before returning it', async () => {
    const store = new MemoryStore();
    store.state = {
      ...emptyInstantViewSessionState(),
      status: 'connected',
      template: {
        templatePresent: true,
        rhashPresent: true,
        hashMatchesEnv: false,
        hashStatus: 'mismatch',
        serverHashConfigured: true,
        detailStatus: 'loaded',
        detailChecked: true,
        templateUrl: `https://instantview.telegram.org/my/merkurov.love?url=https%3A%2F%2Fwww.merkurov.love%2Fflow%2Fexample&rhash=${HASH}`,
        checkedAt: '2026-11-28T09:05:00.000Z',
      },
    };

    const status = await loadInstantViewStatus({ store });
    const serialized = JSON.stringify(status);

    expect(status.template?.templateUrl).toBe(
      'https://instantview.telegram.org/my/merkurov.love?url=https%3A%2F%2Fwww.merkurov.love%2Fflow%2Fexample'
    );
    expect(serialized).not.toContain(HASH);
    expect(serialized).not.toContain('rhash=');
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
