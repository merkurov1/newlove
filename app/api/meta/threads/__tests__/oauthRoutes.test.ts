/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => ({
    id: 'admin',
    role: 'ADMIN',
  })),
}));

import {
  createThreadsOAuthState,
  decryptThreadsOAuthResult,
  THREADS_OAUTH_RESULT_COOKIE,
  THREADS_OAUTH_SCOPE,
  THREADS_OAUTH_STATE_COOKIE,
  THREADS_OAUTH_STATE_MAX_AGE_MS,
  verifyThreadsOAuthState,
} from '@/lib/meta/threadsOAuth';

const { GET: authorize } = require('../authorize/route') as {
  GET: (request: NextRequest) => Promise<Response>;
};
const { GET: callback } = require('../callback/route') as {
  GET: (request: NextRequest) => Promise<Response>;
};
const serverAuth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: jest.Mock;
};

const APP_ID = 'threads-app-id';
const APP_SECRET = 'threads-app-secret';
const CALLBACK_URL = 'https://www.merkurov.love/api/meta/threads/callback';
const AUTH_URL = 'https://www.merkurov.love/api/meta/threads/authorize';

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function callbackRequest(query: Record<string, string>, state?: string): NextRequest {
  const url = new URL(CALLBACK_URL);

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  return new NextRequest(url, {
    headers: state ? { cookie: `${THREADS_OAUTH_STATE_COOKIE}=${state}` } : undefined,
  });
}

function locationOf(response: Response): URL {
  return new URL(String(response.headers.get('location')));
}

function sensitiveValues(): string[] {
  return [APP_SECRET, 'authorization-code', 'short-lived-token', 'long-lived-token'];
}

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.META_THREADS_APP_ID = APP_ID;
  process.env.META_THREADS_APP_SECRET = APP_SECRET;
  serverAuth.requireAdminFromRequest.mockResolvedValue({
    id: 'admin',
    role: 'ADMIN',
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  jest.clearAllMocks();
});

describe('GET /api/meta/threads/authorize', () => {
  it('redirects to Threads OAuth with a signed expiring state', async () => {
    const response = await authorize(new NextRequest(AUTH_URL));

    expect(response.status).toBe(307);

    const location = locationOf(response);
    expect(`${location.origin}${location.pathname}`).toBe('https://threads.com/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe(APP_ID);
    expect(location.searchParams.get('redirect_uri')).toBe(CALLBACK_URL);
    expect(location.searchParams.get('scope')).toBe(THREADS_OAUTH_SCOPE);
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.toString()).not.toContain(APP_SECRET);

    const state = response.cookies.get(THREADS_OAUTH_STATE_COOKIE)?.value;
    expect(state).toBeTruthy();
    expect(location.searchParams.get('state')).toBe(state);
    expect(verifyThreadsOAuthState(String(state), { secret: APP_SECRET })).toMatchObject({
      ok: true,
      redirectUri: CALLBACK_URL,
    });

    const setCookie = String(response.headers.get('set-cookie'));
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
    expect(setCookie).toContain('Path=/api/meta/threads');
  });

  it('rejects unauthenticated admin requests', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await authorize(new NextRequest(AUTH_URL));

    expect(response.status).toBe(401);
  });

  it('returns 503 when the OAuth app is not configured', async () => {
    delete process.env.META_THREADS_APP_ID;
    delete process.env.META_THREADS_APP_SECRET;

    const response = await authorize(new NextRequest(AUTH_URL));

    expect(response.status).toBe(503);
  });
});

describe('GET /api/meta/threads/callback', () => {
  it('exchanges the code, stores an encrypted result and never leaks the token', async () => {
    const state = createThreadsOAuthState({
      secret: APP_SECRET,
      redirectUri: CALLBACK_URL,
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'short-lived-token',
          token_type: 'bearer',
          user_id: '17841405793187218',
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'long-lived-token',
          token_type: 'bearer',
          expires_in: 5183944,
        })
      );

    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await callback(callbackRequest({ code: 'authorization-code', state }, state));

    const location = locationOf(response);
    expect(location.pathname).toBe('/admin/meta/threads');
    expect(location.searchParams.get('status')).toBe('connected');
    expect(location.toString()).not.toContain('long-lived-token');
    expect(location.toString()).not.toContain('authorization-code');

    const encrypted = response.cookies.get(THREADS_OAUTH_RESULT_COOKIE)?.value;
    expect(encrypted).toBeTruthy();
    expect(decryptThreadsOAuthResult(String(encrypted), APP_SECRET)).toEqual({
      userId: '17841405793187218',
      accessToken: 'long-lived-token',
      tokenType: 'bearer',
      expiresIn: 5183944,
      obtainedAt: expect.any(String),
    });
    expect(response.cookies.get(THREADS_OAUTH_STATE_COOKIE)?.value).toBe('');

    const setCookie = String(response.headers.get('set-cookie'));
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
    expect(setCookie).toContain('Path=/admin/meta/threads');

    const urls = (fetchMock.mock.calls as unknown as Array<[string]>).map((call) => call[0]);
    expect(urls[0]).toBe('https://graph.threads.com/oauth/access_token');
    expect(urls[1]).toBe('https://graph.threads.com/access_token');

    for (const url of urls) {
      for (const sensitive of sensitiveValues()) {
        expect(url).not.toContain(sensitive);
      }
    }
  });

  it('rejects a mismatched or missing state without calling Meta', async () => {
    const state = createThreadsOAuthState({
      secret: APP_SECRET,
      redirectUri: CALLBACK_URL,
    });
    const otherState = createThreadsOAuthState({
      secret: APP_SECRET,
      redirectUri: CALLBACK_URL,
    });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await callback(
      callbackRequest({ code: 'authorization-code', state: otherState }, state)
    );
    const location = locationOf(response);

    expect(location.searchParams.get('status')).toBe('error');
    expect(location.searchParams.get('reason')).toBe('invalid_state');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.cookies.get(THREADS_OAUTH_RESULT_COOKIE)).toBeUndefined();
  });

  it('rejects an expired state', async () => {
    const state = createThreadsOAuthState({
      secret: APP_SECRET,
      redirectUri: CALLBACK_URL,
      now: Date.now() - THREADS_OAUTH_STATE_MAX_AGE_MS - 1000,
    });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await callback(callbackRequest({ code: 'authorization-code', state }, state));
    const location = locationOf(response);

    expect(location.searchParams.get('status')).toBe('error');
    expect(location.searchParams.get('reason')).toBe('expired_state');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles the user denying access gracefully', async () => {
    const state = createThreadsOAuthState({
      secret: APP_SECRET,
      redirectUri: CALLBACK_URL,
    });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await callback(
      callbackRequest(
        {
          error: 'access_denied',
          error_reason: 'user_denied',
          state,
        },
        state
      )
    );
    const location = locationOf(response);

    expect(location.searchParams.get('status')).toBe('denied');
    expect(location.searchParams.get('reason')).toBe('user_denied');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.cookies.get(THREADS_OAUTH_RESULT_COOKIE)).toBeUndefined();
  });

  it('does not expose secrets when the code exchange fails', async () => {
    const state = createThreadsOAuthState({
      secret: APP_SECRET,
      redirectUri: CALLBACK_URL,
    });
    const fetchMock = jest.fn(async () =>
      jsonResponse(
        {
          error_message: 'Matching code was not found; authorization-code threads-app-secret',
          code: 400,
        },
        400
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const consoleSpies = [
      jest.spyOn(console, 'error').mockImplementation(() => undefined),
      jest.spyOn(console, 'warn').mockImplementation(() => undefined),
      jest.spyOn(console, 'info').mockImplementation(() => undefined),
      jest.spyOn(console, 'log').mockImplementation(() => undefined),
    ];

    const response = await callback(callbackRequest({ code: 'authorization-code', state }, state));
    const location = locationOf(response);

    expect(location.searchParams.get('status')).toBe('error');
    expect(location.searchParams.get('reason')).toBe('exchange_failed');

    for (const sensitive of sensitiveValues()) {
      expect(location.toString()).not.toContain(sensitive);
    }

    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        const serialized = JSON.stringify(call);
        for (const sensitive of sensitiveValues()) {
          expect(serialized).not.toContain(sensitive);
        }
      }
      spy.mockRestore();
    }
  });

  it('redirects unauthenticated callbacks to /403', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await callback(callbackRequest({ code: 'code' }));
    const location = locationOf(response);

    expect(location.pathname).toBe('/403');
  });
});
