/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

import {
  buildFacebookAuthorizationUrl,
  createFacebookOAuthState,
  decryptFacebookPageSelection,
  encryptFacebookPageSelection,
  exchangeFacebookAuthorizationCode,
  exchangeFacebookLongLivedUserToken,
  fetchFacebookGrantedPermissions,
  fetchFacebookPages,
  FACEBOOK_OAUTH_SCOPE,
  FACEBOOK_OAUTH_STATE_MAX_AGE_MS,
  missingFacebookScopes,
  readFacebookOAuthConfig,
  verifyFacebookOAuthState,
  verifyFacebookPageAccess,
} from '../facebookOAuth';

const CONFIG = {
  appId: 'facebook-app-id',
  appSecret: 'facebook-app-secret',
  version: 'v26.0',
  configured: true,
  missing: [] as string[],
};

function response(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);

  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => body,
  } as unknown as Response;
}

describe('Facebook OAuth helpers', () => {
  it('reads the dedicated app configuration and lists missing values', () => {
    expect(readFacebookOAuthConfig({})).toMatchObject({
      configured: false,
      missing: ['META_FACEBOOK_APP_ID', 'META_FACEBOOK_APP_SECRET'],
    });

    expect(
      readFacebookOAuthConfig({
        META_FACEBOOK_APP_ID: 'id',
        META_FACEBOOK_APP_SECRET: 'secret',
        META_GRAPH_API_VERSION: 'v27.0',
      })
    ).toMatchObject({
      appId: 'id',
      appSecret: 'secret',
      version: 'v27.0',
      configured: true,
    });
  });

  it('builds the official dialog URL with Page scopes and no secret', () => {
    const redirectUri = 'https://www.merkurov.love/api/meta/facebook/callback';
    const url = new URL(
      buildFacebookAuthorizationUrl({
        appId: 'facebook-app-id',
        redirectUri,
        state: 'signed-state',
        version: 'v26.0',
        reRequest: true,
      })
    );

    expect(`${url.origin}${url.pathname}`).toBe('https://www.facebook.com/v26.0/dialog/oauth');
    expect(url.searchParams.get('client_id')).toBe('facebook-app-id');
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(url.searchParams.get('scope')).toBe(FACEBOOK_OAUTH_SCOPE);
    expect(url.searchParams.get('scope')).toContain('pages_manage_posts');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('signed-state');
    expect(url.searchParams.get('auth_type')).toBe('rerequest');
    expect(url.toString()).not.toContain('facebook-app-secret');
  });

  it('creates a signed state that expires and rejects tampering', () => {
    const now = Date.UTC(2026, 10, 3, 12, 0, 0);
    const redirectUri = 'https://www.merkurov.love/api/meta/facebook/callback';
    const state = createFacebookOAuthState({
      secret: 'state-secret',
      redirectUri,
      now,
    });

    expect(verifyFacebookOAuthState(state, { secret: 'state-secret', now })).toMatchObject({
      ok: true,
      redirectUri,
    });

    expect(
      verifyFacebookOAuthState(state, {
        secret: 'state-secret',
        now: now + FACEBOOK_OAUTH_STATE_MAX_AGE_MS + 1,
      })
    ).toEqual({ ok: false, reason: 'expired' });

    expect(verifyFacebookOAuthState(state, { secret: 'wrong-secret', now })).toEqual({
      ok: false,
      reason: 'invalid',
    });

    const tampered = `${state.slice(0, -1)}${state.endsWith('a') ? 'b' : 'a'}`;
    expect(verifyFacebookOAuthState(tampered, { secret: 'state-secret', now })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('exchanges the code with secrets only in the POST body', async () => {
    const fetchMock = jest.fn(async () =>
      response({
        access_token: 'short-lived-user-token',
        token_type: 'bearer',
        expires_in: 3600,
      })
    );

    const result = await exchangeFacebookAuthorizationCode({
      config: CONFIG,
      code: 'authorization-code',
      redirectUri: 'https://www.merkurov.love/api/meta/facebook/callback',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: true,
      token: {
        accessToken: 'short-lived-user-token',
        tokenType: 'bearer',
        expiresIn: 3600,
      },
    });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://graph.facebook.com/v26.0/oauth/access_token');
    expect(call[1].method).toBe('POST');
    expect(call[0]).not.toContain('facebook-app-secret');
    expect(call[0]).not.toContain('authorization-code');

    const body = new URLSearchParams(String(call[1].body));
    expect(body.get('client_id')).toBe('facebook-app-id');
    expect(body.get('client_secret')).toBe('facebook-app-secret');
    expect(body.get('redirect_uri')).toBe('https://www.merkurov.love/api/meta/facebook/callback');
    expect(body.get('code')).toBe('authorization-code');
  });

  it('sanitizes token exchange errors without leaking the code or secret', async () => {
    const fetchMock = jest.fn(async () =>
      response(
        {
          error: {
            message: 'Invalid code authorization-code for client facebook-app-secret',
          },
        },
        400
      )
    );

    const result = await exchangeFacebookAuthorizationCode({
      config: CONFIG,
      code: 'authorization-code',
      redirectUri: 'https://www.merkurov.love/api/meta/facebook/callback',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain('authorization-code');
      expect(result.error).not.toContain('facebook-app-secret');
    }

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).not.toContain('facebook-app-secret');
    expect(call[0]).not.toContain('authorization-code');
  });

  it('exchanges a short-lived User token for a long-lived User token', async () => {
    const fetchMock = jest.fn(async () =>
      response({
        access_token: 'long-lived-user-token',
        token_type: 'bearer',
        expires_in: 5183944,
      })
    );

    const result = await exchangeFacebookLongLivedUserToken({
      config: CONFIG,
      shortLivedToken: 'short-lived-user-token',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: true,
      token: {
        accessToken: 'long-lived-user-token',
        expiresIn: 5183944,
      },
    });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = new URLSearchParams(String(call[1].body));
    expect(body.get('grant_type')).toBe('fb_exchange_token');
    expect(body.get('fb_exchange_token')).toBe('short-lived-user-token');
    expect(call[0]).not.toContain('long-lived-user-token');
  });

  it('lists Page tokens with the User token in the Authorization header', async () => {
    const fetchMock = jest.fn(async () =>
      response({
        data: [
          {
            id: 'page-1',
            name: 'Cute Kitten Page',
            access_token: 'page-token-1',
            tasks: ['CREATE_CONTENT', 'MANAGE'],
            perms: ['ADMINISTER'],
          },
        ],
      })
    );

    const result = await fetchFacebookPages({
      config: CONFIG,
      userToken: 'long-lived-user-token',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      pages: [
        {
          id: 'page-1',
          name: 'Cute Kitten Page',
          accessToken: 'page-token-1',
          tasks: ['CREATE_CONTENT', 'MANAGE'],
          perms: ['ADMINISTER'],
        },
      ],
    });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).not.toContain('long-lived-user-token');
    expect((call[1].headers as Record<string, string>).Authorization).toBe(
      'Bearer long-lived-user-token'
    );
  });

  it('reads granted permissions and detects missing Page scopes', async () => {
    const fetchMock = jest.fn(async () =>
      response({
        data: [
          { permission: 'pages_show_list', status: 'granted' },
          { permission: 'pages_read_engagement', status: 'granted' },
          { permission: 'pages_manage_posts', status: 'declined' },
        ],
      })
    );

    const result = await fetchFacebookGrantedPermissions({
      config: CONFIG,
      userToken: 'long-lived-user-token',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      permissions: ['pages_show_list', 'pages_read_engagement'],
    });
    if (result.ok) {
      expect(missingFacebookScopes(result.permissions)).toEqual(['pages_manage_posts']);
    }
  });

  it('verifies Page access without putting the Page token in the URL', async () => {
    const fetchMock = jest.fn(async () =>
      response({
        id: 'page-1',
        name: 'Cute Kitten Page',
        tasks: ['CREATE_CONTENT'],
        perms: ['ADMINISTER'],
      })
    );

    const result = await verifyFacebookPageAccess({
      config: CONFIG,
      pageId: 'page-1',
      pageToken: 'page-token-1',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: true,
      id: 'page-1',
      name: 'Cute Kitten Page',
    });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).not.toContain('page-token-1');
    expect((call[1].headers as Record<string, string>).Authorization).toBe('Bearer page-token-1');
  });

  it('encrypts the multi-Page selection and rejects tampering or expiry', () => {
    const now = Date.UTC(2026, 10, 3, 12, 0, 0);
    const selection = {
      issuedAt: now,
      userId: 'admin',
      permissions: ['pages_show_list'],
      pages: [
        {
          id: 'page-1',
          name: 'Page One',
          accessToken: 'page-token-1',
          tasks: [],
          perms: [],
        },
      ],
    };
    const encrypted = encryptFacebookPageSelection(selection, 'facebook-app-secret');

    expect(encrypted).not.toContain('page-token-1');
    expect(decryptFacebookPageSelection(encrypted, 'facebook-app-secret', now)).toEqual(selection);
    expect(
      decryptFacebookPageSelection(
        encrypted,
        'facebook-app-secret',
        now + FACEBOOK_OAUTH_STATE_MAX_AGE_MS + 1
      )
    ).toBeNull();
    const encryptedParts = encrypted.split('.');
    encryptedParts[3] = `${encryptedParts[3][0] === 'a' ? 'b' : 'a'}${encryptedParts[3].slice(1)}`;

    expect(
      decryptFacebookPageSelection(encryptedParts.join('.'), 'facebook-app-secret', now)
    ).toBeNull();
  });
});
