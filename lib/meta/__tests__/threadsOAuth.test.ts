/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

import {
  buildThreadsAuthorizationUrl,
  completeThreadsOAuth,
  createThreadsOAuthState,
  decryptThreadsOAuthResult,
  encryptThreadsOAuthResult,
  exchangeThreadsAuthorizationCode,
  exchangeThreadsLongLivedToken,
  readThreadsOAuthConfig,
  THREADS_AUTHORIZE_URL,
  THREADS_CODE_TOKEN_URL,
  THREADS_LONG_LIVED_TOKEN_URL,
  THREADS_OAUTH_SCOPE,
  THREADS_OAUTH_STATE_MAX_AGE_MS,
  verifyThreadsOAuthState,
} from '../threadsOAuth';

const CONFIG = {
  appId: 'threads-app-id',
  appSecret: 'threads-app-secret',
  configured: true,
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('Threads OAuth helpers', () => {
  it('builds the official authorization URL with the required scope', () => {
    const redirectUri = 'https://www.merkurov.love/api/meta/threads/callback';
    const url = new URL(
      buildThreadsAuthorizationUrl({
        appId: 'threads-app-id',
        redirectUri,
        state: 'signed-state',
      })
    );

    expect(`${url.origin}${url.pathname}`).toBe(THREADS_AUTHORIZE_URL);
    expect(url.searchParams.get('client_id')).toBe('threads-app-id');
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(url.searchParams.get('scope')).toBe(THREADS_OAUTH_SCOPE);
    expect(url.searchParams.get('scope')).toBe('threads_basic,threads_content_publish');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('signed-state');
    expect(url.toString()).not.toContain('threads-app-secret');
  });

  it('creates a signed state that expires and rejects tampering', () => {
    const now = Date.UTC(2026, 10, 3, 12, 0, 0);
    const state = createThreadsOAuthState({
      secret: 'state-secret',
      redirectUri: 'https://www.merkurov.love/api/meta/threads/callback',
      now,
    });

    expect(verifyThreadsOAuthState(state, { secret: 'state-secret', now })).toMatchObject({
      ok: true,
      redirectUri: 'https://www.merkurov.love/api/meta/threads/callback',
    });

    expect(
      verifyThreadsOAuthState(state, {
        secret: 'state-secret',
        now: now + THREADS_OAUTH_STATE_MAX_AGE_MS + 1,
      })
    ).toEqual({ ok: false, reason: 'expired' });

    expect(verifyThreadsOAuthState(state, { secret: 'wrong-secret', now })).toEqual({
      ok: false,
      reason: 'invalid',
    });

    const tampered = `${state.slice(0, -1)}${state.endsWith('a') ? 'b' : 'a'}`;
    expect(verifyThreadsOAuthState(tampered, { secret: 'state-secret', now })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('exchanges the authorization code with secrets only in the POST body', async () => {
    const fetchMock = jest.fn(async () =>
      response({
        access_token: 'short-lived-token',
        token_type: 'bearer',
        user_id: 17841405793187218,
      })
    );

    const result = await exchangeThreadsAuthorizationCode({
      config: CONFIG,
      code: 'authorization-code',
      redirectUri: 'https://www.merkurov.love/api/meta/threads/callback',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: true,
      userId: '17841405793187218',
      accessToken: 'short-lived-token',
      tokenType: 'bearer',
    });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(THREADS_CODE_TOKEN_URL);
    expect(call[1].method).toBe('POST');
    expect(call[0]).not.toContain('threads-app-secret');
    expect(call[0]).not.toContain('authorization-code');

    const body = new URLSearchParams(String(call[1].body));
    expect(body.get('client_id')).toBe('threads-app-id');
    expect(body.get('client_secret')).toBe('threads-app-secret');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('redirect_uri')).toBe('https://www.merkurov.love/api/meta/threads/callback');
    expect(body.get('code')).toBe('authorization-code');
  });

  it('preserves a large numeric Threads User ID exactly', async () => {
    const raw =
      '{"access_token":"short-lived-token","token_type":"bearer","user_id":17841405793187218}';
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => raw,
      json: async () => JSON.parse(raw),
    })) as unknown as typeof fetch;

    const result = await exchangeThreadsAuthorizationCode({
      config: CONFIG,
      code: 'authorization-code',
      redirectUri: 'https://www.merkurov.love/api/meta/threads/callback',
      fetch: fetchMock,
    });

    expect(result).toMatchObject({
      ok: true,
      userId: '17841405793187218',
    });
  });

  it('exchanges the short-lived token for a long-lived token without URL secrets', async () => {
    const now = new Date('2026-11-03T12:00:00.000Z');
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        response({
          access_token: 'short-lived-token',
          token_type: 'bearer',
          user_id: '17841405793187218',
        })
      )
      .mockResolvedValueOnce(
        response({
          access_token: 'long-lived-token',
          token_type: 'bearer',
          expires_in: 5183944,
        })
      );

    const result = await completeThreadsOAuth({
      config: CONFIG,
      code: 'authorization-code',
      redirectUri: 'https://www.merkurov.love/api/meta/threads/callback',
      fetch: fetchMock as unknown as typeof fetch,
      now: () => now,
    });

    expect(result).toEqual({
      ok: true,
      token: {
        userId: '17841405793187218',
        accessToken: 'long-lived-token',
        tokenType: 'bearer',
        expiresIn: 5183944,
        obtainedAt: now.toISOString(),
      },
    });

    const longCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(longCall[0]).toBe(THREADS_LONG_LIVED_TOKEN_URL);
    expect(longCall[0]).not.toContain('threads-app-secret');
    expect(longCall[0]).not.toContain('short-lived-token');

    const body = new URLSearchParams(String(longCall[1].body));
    expect(body.get('grant_type')).toBe('th_exchange_token');
    expect(body.get('client_secret')).toBe('threads-app-secret');
    expect(body.get('access_token')).toBe('short-lived-token');
  });

  it('reports a failed code exchange without leaking the code or secret', async () => {
    const fetchMock = jest.fn(async () =>
      response(
        {
          error_message: 'Matching code was not found or was already used',
          code: 400,
          error_type: 'OAuthException',
        },
        400
      )
    );

    const result = await exchangeThreadsAuthorizationCode({
      config: CONFIG,
      code: 'secret-code-value',
      redirectUri: 'https://www.merkurov.love/api/meta/threads/callback',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);

    if (result.ok) throw new Error('Expected failure');

    expect(result.error).toContain('Matching code was not found');
    expect(result.error).not.toContain('secret-code-value');
    expect(result.error).not.toContain('threads-app-secret');
  });

  it('reports a failed long-lived exchange without returning the short token', async () => {
    const fetchMock = jest.fn(async () =>
      response(
        {
          error: {
            message: 'Invalid short-lived-token for exchange',
            code: 400,
          },
        },
        400
      )
    );

    const result = await exchangeThreadsLongLivedToken({
      config: CONFIG,
      shortLivedToken: 'short-lived-token',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);

    if (result.ok) throw new Error('Expected failure');

    expect(result.error).toContain('Invalid');
    expect(result.error).not.toContain('short-lived-token');
    expect(result.error).not.toContain('threads-app-secret');
  });

  it('encrypts the admin result and rejects tampered ciphertext', () => {
    const token = {
      userId: '17841405793187218',
      accessToken: 'long-lived-token',
      tokenType: 'bearer',
      expiresIn: 5183944,
      obtainedAt: '2026-11-03T12:00:00.000Z',
    };

    const encrypted = encryptThreadsOAuthResult(token, 'result-secret');
    expect(encrypted).not.toContain('long-lived-token');
    expect(decryptThreadsOAuthResult(encrypted, 'result-secret')).toEqual(token);
    expect(decryptThreadsOAuthResult(encrypted, 'wrong-secret')).toBeNull();

    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('a') ? 'b' : 'a'}`;
    expect(decryptThreadsOAuthResult(tampered, 'result-secret')).toBeNull();
  });

  it('reports missing OAuth configuration', () => {
    expect(readThreadsOAuthConfig({})).toEqual({
      appId: null,
      appSecret: null,
      configured: false,
    });

    expect(
      readThreadsOAuthConfig({
        META_THREADS_APP_ID: 'id',
        META_THREADS_APP_SECRET: 'secret',
      })
    ).toEqual({
      appId: 'id',
      appSecret: 'secret',
      configured: true,
    });
  });
});
