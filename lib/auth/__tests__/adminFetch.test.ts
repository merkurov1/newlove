/**
 * @jest-environment jsdom
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/supabase-browser', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
    },
  },
}));

const browser = require('@/lib/supabase-browser') as {
  supabase: {
    auth: {
      getSession: jest.Mock;
      refreshSession: jest.Mock;
    };
  };
};
const { adminFetch, readAdminAuthSnapshot } =
  require('../adminFetch') as typeof import('../adminFetch');

function session(token: string, expiresInMs = 60 * 60 * 1000, email = 'owner@example.com') {
  return {
    data: {
      session: {
        access_token: token,
        expires_at: Math.floor((Date.now() + expiresInMs) / 1000),
        user: { email },
      },
    },
    error: null,
  };
}

describe('adminFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the Supabase access token as a Bearer credential and keeps cookies', async () => {
    browser.supabase.auth.getSession.mockResolvedValue(session('token-one'));
    const fetchMock = jest.fn(async () => ({ status: 200 }) as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await adminFetch('/api/admin/youtube/channels?project=art-engine');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer token-one');
    expect(new Headers(init.headers).get('accept')).toBe('application/json');
  });

  it('refreshes once and retries after a 401', async () => {
    browser.supabase.auth.getSession.mockResolvedValue(session('expired-token', -1000));
    browser.supabase.auth.refreshSession
      .mockResolvedValueOnce(session('expired-token'))
      .mockResolvedValueOnce(session('fresh-token'));

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ status: 401 } as Response)
      .mockResolvedValueOnce({ status: 200 } as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await adminFetch('/api/admin/youtube/channels');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The near-expiry token is refreshed before the first request.
    expect(browser.supabase.auth.refreshSession).toHaveBeenCalledTimes(2);
    const retryInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(retryInit.headers).get('authorization')).toBe('Bearer fresh-token');
  });

  it('still attempts the cookie path when no browser session exists', async () => {
    browser.supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const fetchMock = jest.fn(async () => ({ status: 401 }) as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await adminFetch('/api/admin/youtube/channels');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('authorization')).toBeNull();
  });

  it('reports only redacted session diagnostics', async () => {
    browser.supabase.auth.getSession.mockResolvedValue(session('secret-token'));

    const snapshot = await readAdminAuthSnapshot();

    expect(snapshot).toMatchObject({ hasSession: true, email: 'owner@example.com' });
    expect(JSON.stringify(snapshot)).not.toContain('secret-token');
  });
});
