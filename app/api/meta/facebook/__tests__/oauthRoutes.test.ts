/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => ({
    id: 'admin',
    role: 'ADMIN',
  })),
}));

jest.mock('@/lib/meta/facebookConnection', () => ({
  getFacebookAdminStore: jest.fn(() => ({})),
  loadFacebookConnectionState: jest.fn(async () => ({
    pageId: null,
  })),
  saveFacebookPageConnection: jest.fn(async () => undefined),
  disableFacebookPageConnection: jest.fn(async () => undefined),
}));

import {
  createFacebookOAuthState,
  decryptFacebookPageSelection,
  encryptFacebookPageSelection,
  FACEBOOK_OAUTH_PAGES_COOKIE,
  FACEBOOK_OAUTH_SCOPE,
  FACEBOOK_OAUTH_STATE_COOKIE,
} from '@/lib/meta/facebookOAuth';

const { GET: authorize } = require('../authorize/route') as {
  GET: (request: NextRequest) => Promise<Response>;
};
const { GET: callback } = require('../callback/route') as {
  GET: (request: NextRequest) => Promise<Response>;
};
const { POST: select } = require('../select/route') as {
  POST: (request: NextRequest) => Promise<Response>;
};

const serverAuth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: jest.Mock;
};
const connection = require('@/lib/meta/facebookConnection') as {
  getFacebookAdminStore: jest.Mock;
  loadFacebookConnectionState: jest.Mock;
  saveFacebookPageConnection: jest.Mock;
};

const APP_ID = 'facebook-app-id';
const APP_SECRET = 'facebook-app-secret';
const CALLBACK_URL = 'https://www.merkurov.love/api/meta/facebook/callback';
const AUTH_URL = 'https://www.merkurov.love/api/meta/facebook/authorize';

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);

  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => body,
  } as unknown as Response;
}

function callbackRequest(query: Record<string, string>, state?: string): NextRequest {
  const url = new URL(CALLBACK_URL);

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  return new NextRequest(url, {
    headers: state ? { cookie: `${FACEBOOK_OAUTH_STATE_COOKIE}=${state}` } : undefined,
  });
}

function locationOf(response: Response): URL {
  return new URL(String(response.headers.get('location')));
}

function pageListResponse() {
  return jsonResponse({
    data: [
      {
        id: 'page-1',
        name: 'Cute Kitten Page',
        access_token: 'page-token-1',
        tasks: ['CREATE_CONTENT'],
        perms: ['ADMINISTER'],
      },
    ],
  });
}

function successfulFetch() {
  return jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({
        access_token: 'short-lived-user-token',
        token_type: 'bearer',
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({
        access_token: 'long-lived-user-token',
        token_type: 'bearer',
        expires_in: 5183944,
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({
        data: [
          { permission: 'pages_show_list', status: 'granted' },
          { permission: 'pages_read_engagement', status: 'granted' },
          { permission: 'pages_manage_posts', status: 'granted' },
        ],
      })
    )
    .mockResolvedValueOnce(pageListResponse())
    .mockResolvedValueOnce(
      jsonResponse({
        id: 'page-1',
        name: 'Cute Kitten Page',
        tasks: ['CREATE_CONTENT'],
        perms: ['ADMINISTER'],
      })
    );
}

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.META_FACEBOOK_APP_ID = APP_ID;
  process.env.META_FACEBOOK_APP_SECRET = APP_SECRET;
  delete process.env.META_FACEBOOK_PAGE_ID;
  serverAuth.requireAdminFromRequest.mockResolvedValue({
    id: 'admin',
    role: 'ADMIN',
  });
  connection.getFacebookAdminStore.mockReturnValue({});
  connection.loadFacebookConnectionState.mockResolvedValue({ pageId: null });
  connection.saveFacebookPageConnection.mockResolvedValue(undefined);
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  jest.clearAllMocks();
});

describe('GET /api/meta/facebook/authorize', () => {
  it('redirects to the official Facebook dialog with a signed state', async () => {
    const response = await authorize(new NextRequest(AUTH_URL));

    expect(response.status).toBe(307);

    const location = locationOf(response);
    expect(`${location.origin}${location.pathname}`).toBe(
      'https://www.facebook.com/v26.0/dialog/oauth'
    );
    expect(location.searchParams.get('client_id')).toBe(APP_ID);
    expect(location.searchParams.get('redirect_uri')).toBe(CALLBACK_URL);
    expect(location.searchParams.get('scope')).toBe(FACEBOOK_OAUTH_SCOPE);
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('auth_type')).toBe('rerequest');
    expect(location.toString()).not.toContain(APP_SECRET);

    const state = response.cookies.get(FACEBOOK_OAUTH_STATE_COOKIE)?.value;
    expect(state).toBeTruthy();
    expect(location.searchParams.get('state')).toBe(state);

    const setCookie = String(response.headers.get('set-cookie'));
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
    expect(setCookie).toContain('Path=/api/meta/facebook');
  });

  it('rejects unauthenticated admin requests', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await authorize(new NextRequest(AUTH_URL));

    expect(response.status).toBe(401);
  });

  it('returns 503 when the OAuth app is not configured', async () => {
    delete process.env.META_FACEBOOK_APP_ID;
    delete process.env.META_FACEBOOK_APP_SECRET;

    const response = await authorize(new NextRequest(AUTH_URL));

    expect(response.status).toBe(503);
  });
});

describe('GET /api/meta/facebook/callback', () => {
  it('stores the encrypted Page token and never exposes tokens in the redirect', async () => {
    const state = createFacebookOAuthState({
      secret: APP_SECRET,
      redirectUri: CALLBACK_URL,
    });
    const fetchMock = successfulFetch();
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await callback(callbackRequest({ code: 'authorization-code', state }, state));

    const location = locationOf(response);
    expect(location.pathname).toBe('/admin/pierrot/analytics');
    expect(location.searchParams.get('facebook')).toBe('connected');
    expect(location.searchParams.get('page')).toBe('page-1');
    expect(location.toString()).not.toContain('page-token-1');
    expect(location.toString()).not.toContain('long-lived-user-token');
    expect(location.toString()).not.toContain('authorization-code');

    expect(connection.saveFacebookPageConnection).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        pageId: 'page-1',
        pageName: 'Cute Kitten Page',
        pageToken: 'page-token-1',
        scopes: expect.arrayContaining(['pages_manage_posts']),
        connectedBy: 'admin',
      })
    );

    expect(response.cookies.get(FACEBOOK_OAUTH_STATE_COOKIE)?.value).toBe('');
  });

  it('requests an explicit Page choice when several Pages are accessible', async () => {
    const state = createFacebookOAuthState({
      secret: APP_SECRET,
      redirectUri: CALLBACK_URL,
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'short-lived-user-token' }))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'long-lived-user-token', expires_in: 100 })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { permission: 'pages_show_list', status: 'granted' },
            { permission: 'pages_read_engagement', status: 'granted' },
            { permission: 'pages_manage_posts', status: 'granted' },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: 'page-1',
              name: 'Page One',
              access_token: 'page-token-1',
            },
            {
              id: 'page-2',
              name: 'Page Two',
              access_token: 'page-token-2',
            },
          ],
        })
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await callback(callbackRequest({ code: 'authorization-code', state }, state));

    const location = locationOf(response);
    expect(location.searchParams.get('facebook')).toBe('select');
    expect(connection.saveFacebookPageConnection).not.toHaveBeenCalled();

    const encrypted = response.cookies.get(FACEBOOK_OAUTH_PAGES_COOKIE)?.value;
    expect(encrypted).toBeTruthy();
    const selection = decryptFacebookPageSelection(String(encrypted), APP_SECRET);
    expect(selection?.pages.map((page) => page.id)).toEqual(['page-1', 'page-2']);
    expect(JSON.stringify(selection)).toContain('page-token-1');
  });

  it('rejects a mismatched state without calling Meta', async () => {
    const state = createFacebookOAuthState({
      secret: APP_SECRET,
      redirectUri: CALLBACK_URL,
    });
    const otherState = createFacebookOAuthState({
      secret: APP_SECRET,
      redirectUri: CALLBACK_URL,
    });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await callback(
      callbackRequest({ code: 'authorization-code', state: otherState }, state)
    );

    expect(locationOf(response).searchParams.get('reason')).toBe('invalid_state');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles the owner denying access without calling Meta', async () => {
    const state = createFacebookOAuthState({
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
    expect(location.searchParams.get('facebook')).toBe('denied');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated callbacks to /403', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await callback(callbackRequest({ code: 'code' }));

    expect(locationOf(response).pathname).toBe('/403');
  });
});

describe('POST /api/meta/facebook/select', () => {
  it('stores only the explicitly selected Page token', async () => {
    const encryptedPages = encryptFacebookPageSelection(
      {
        issuedAt: Date.now(),
        userId: 'admin',
        permissions: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
        pages: [
          {
            id: 'page-1',
            name: 'Page One',
            accessToken: 'page-token-1',
            tasks: [],
            perms: [],
          },
          {
            id: 'page-2',
            name: 'Page Two',
            accessToken: 'page-token-2',
            tasks: [],
            perms: [],
          },
        ],
      },
      APP_SECRET
    );
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        id: 'page-2',
        name: 'Page Two',
        tasks: ['CREATE_CONTENT'],
        perms: ['ADMINISTER'],
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const form = new FormData();
    form.set('page_id', 'page-2');
    const request = new NextRequest('https://www.merkurov.love/api/meta/facebook/select', {
      method: 'POST',
      body: form,
      headers: {
        cookie: `${FACEBOOK_OAUTH_PAGES_COOKIE}=${encryptedPages}`,
      },
    });

    const response = await select(request);

    expect(response.status).toBe(303);
    expect(locationOf(response).searchParams.get('facebook')).toBe('connected');
    expect(connection.saveFacebookPageConnection).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        pageId: 'page-2',
        pageToken: 'page-token-2',
      })
    );
  });
});
