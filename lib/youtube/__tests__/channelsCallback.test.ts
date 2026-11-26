/** @jest-environment node */

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({
    get: (name: string) =>
      name === 'pierrot_youtube_channels_oauth' && mockCookieNonce
        ? { value: mockCookieNonce }
        : undefined,
  })),
}));

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(),
  getServerSupabaseClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/analytics/website/providers/oauth', () => {
  const actual = jest.requireActual('@/lib/analytics/website/providers/oauth');
  return {
    ...actual,
    exchangeGoogleCode: jest.fn(),
    fetchGoogleUserInfo: jest.fn(),
  };
});

jest.mock('@/lib/youtube/channels', () => {
  const actual = jest.requireActual('@/lib/youtube/channels');
  return {
    ...actual,
    saveOAuthConnection: jest.fn(),
    replaceConnectionChannels: jest.fn(),
  };
});

jest.mock('@/lib/youtube/api', () => ({
  listMyChannels: jest.fn(),
}));

import { signState } from '@/lib/analytics/website/tokenCrypto';
import { handleYouTubeChannelsCallback } from '../channelsCallback';

const serverAuth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: jest.Mock;
};
const oauth = require('@/lib/analytics/website/providers/oauth') as {
  exchangeGoogleCode: jest.Mock;
  fetchGoogleUserInfo: jest.Mock;
};
const channels = require('@/lib/youtube/channels') as {
  saveOAuthConnection: jest.Mock;
  replaceConnectionChannels: jest.Mock;
};
const api = require('@/lib/youtube/api') as { listMyChannels: jest.Mock };

let mockCookieNonce = 'nonce-1';
const originalEnv = { ...process.env };

function state(overrides: Record<string, unknown> = {}) {
  return signState(
    {
      uid: 'owner-1',
      purpose: 'youtube_channels',
      project: 'art-engine',
      nonce: 'nonce-1',
      exp: Date.now() + 60_000,
      ...overrides,
    },
    'test-sync-secret'
  );
}

function callback(query: Record<string, string>) {
  const url = new URL('https://www.merkurov.love/api/auth/youtube-management/callback');
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new Request(url.toString());
}

function redirectLocation(response: Response): URL {
  return new URL(response.headers.get('location') || '');
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
  process.env.ANALYTICS_SYNC_SECRET = 'test-sync-secret';
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.merkurov.love';
  delete process.env.YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI;
  delete process.env.YOUTUBE_MANAGEMENT_GOOGLE_REDIRECT_URI;
  mockCookieNonce = 'nonce-1';

  serverAuth.requireAdminFromRequest.mockResolvedValue({ id: 'owner-1', role: 'ADMIN' });
  oauth.exchangeGoogleCode.mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    scope:
      'openid email https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.upload',
    tokenType: 'Bearer',
  });
  oauth.fetchGoogleUserInfo.mockResolvedValue({
    email: 'Merckurov@gmail.com',
    name: 'Merkurov',
    subject: 'google-a',
  });
  channels.saveOAuthConnection.mockResolvedValue({
    id: 'connection-a',
    googleAccountEmail: 'merckurov@gmail.com',
    status: 'connected',
  });
  channels.replaceConnectionChannels.mockResolvedValue([]);
  api.listMyChannels.mockResolvedValue({
    channels: [
      { channelId: 'UC_art', title: 'Merkurov Art', handle: '@merkurov-art' },
    ],
    truncated: false,
  });
});

afterAll(() => {
  process.env = originalEnv;
});

describe('multi-channel OAuth callback', () => {
  it('exchanges the code, saves account A and persists every discovered channel', async () => {
    const response = await handleYouTubeChannelsCallback(
      callback({ code: 'auth-code', state: state() })
    );
    const location = redirectLocation(response);

    expect(location.pathname).toBe('/admin/pierrot/youtube');
    expect(location.searchParams.get('youtube_channels')).toBe('connected');
    expect(location.searchParams.get('account')).toBe('merckurov@gmail.com');
    expect(location.searchParams.get('channels')).toBe('1');
    expect(oauth.exchangeGoogleCode).toHaveBeenCalledWith('auth-code', {
      redirectUri: 'https://www.merkurov.love/api/auth/youtube-management/callback',
    });
    expect(channels.saveOAuthConnection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerId: 'owner-1',
        googleAccountEmail: 'Merckurov@gmail.com',
        googleAccountId: 'google-a',
      })
    );
    expect(channels.replaceConnectionChannels).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ connectionId: 'connection-a', ownerId: 'owner-1' })
    );
  });

  it('returns the Google OAuth error without exchanging a code', async () => {
    const response = await handleYouTubeChannelsCallback(
      callback({ error: 'access_denied', state: state() })
    );
    const location = redirectLocation(response);

    expect(location.searchParams.get('youtube_channels')).toBe('error');
    expect(location.searchParams.get('reason')).toBe('access_denied');
    expect(oauth.exchangeGoogleCode).not.toHaveBeenCalled();
  });

  it('rejects a tampered state signature before token exchange', async () => {
    const valid = state();
    const tampered = `${valid.slice(0, -2)}xx`;

    const response = await handleYouTubeChannelsCallback(
      callback({ code: 'auth-code', state: tampered })
    );

    expect(redirectLocation(response).searchParams.get('reason')).toBe('invalid_state');
    expect(oauth.exchangeGoogleCode).not.toHaveBeenCalled();
  });

  it('rejects a valid state when the nonce cookie is missing or different', async () => {
    mockCookieNonce = 'another-nonce';

    const response = await handleYouTubeChannelsCallback(
      callback({ code: 'auth-code', state: state() })
    );

    expect(redirectLocation(response).searchParams.get('reason')).toBe('invalid_state');
    expect(oauth.exchangeGoogleCode).not.toHaveBeenCalled();
  });

  it('rejects an expired state', async () => {
    const response = await handleYouTubeChannelsCallback(
      callback({ code: 'auth-code', state: state({ exp: Date.now() - 1 }) })
    );

    expect(redirectLocation(response).searchParams.get('reason')).toBe('invalid_state');
  });

  it('rejects a state issued for another user or purpose', async () => {
    const otherUser = await handleYouTubeChannelsCallback(
      callback({ code: 'auth-code', state: state({ uid: 'owner-2' }) })
    );
    expect(redirectLocation(otherUser).searchParams.get('reason')).toBe('invalid_state');

    const otherPurpose = await handleYouTubeChannelsCallback(
      callback({ code: 'auth-code', state: state({ purpose: 'youtube_management' }) })
    );
    expect(redirectLocation(otherPurpose).searchParams.get('reason')).toBe('invalid_state');
  });

  it('refuses a partial grant that omits analytics or upload scopes', async () => {
    oauth.exchangeGoogleCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: null,
      scope: 'openid email https://www.googleapis.com/auth/youtube.readonly',
      tokenType: 'Bearer',
    });

    const response = await handleYouTubeChannelsCallback(
      callback({ code: 'auth-code', state: state() })
    );
    const location = redirectLocation(response);

    expect(location.searchParams.get('youtube_channels')).toBe('error');
    expect(location.searchParams.get('reason')).toBe('missing_scopes');
    expect(location.searchParams.get('missing')).toContain('yt-analytics.readonly');
    expect(location.searchParams.get('missing')).toContain('youtube.upload');
    expect(channels.saveOAuthConnection).not.toHaveBeenCalled();
  });

  it('accepts broader youtube/force-ssl scopes as satisfying read and upload', async () => {
    oauth.exchangeGoogleCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      refreshToken: null,
      expiresAt: null,
      scope:
        'openid email https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/yt-analytics.readonly',
      tokenType: 'Bearer',
    });

    const response = await handleYouTubeChannelsCallback(
      callback({ code: 'auth-code', state: state() })
    );

    expect(redirectLocation(response).searchParams.get('youtube_channels')).toBe('connected');
    expect(channels.saveOAuthConnection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        scopes: expect.arrayContaining(['https://www.googleapis.com/auth/youtube']),
      })
    );
  });

  it('keeps the connection when discovery fails so the owner can retry', async () => {
    api.listMyChannels.mockRejectedValueOnce(Object.assign(new Error('quota'), {
      code: 'quota_exceeded',
    }));

    const response = await handleYouTubeChannelsCallback(
      callback({ code: 'auth-code', state: state() })
    );
    const location = redirectLocation(response);

    expect(location.searchParams.get('youtube_channels')).toBe('channels_failed');
    expect(location.searchParams.get('reason')).toBe('quota_exceeded');
    expect(location.searchParams.get('account')).toBe('merckurov@gmail.com');
    expect(channels.saveOAuthConnection).toHaveBeenCalledTimes(1);
    expect(channels.replaceConnectionChannels).not.toHaveBeenCalled();
  });

  it('passes a repeated consent without refresh_token to the retention-aware save path', async () => {
    oauth.exchangeGoogleCode.mockResolvedValueOnce({
      accessToken: 'access-token',
      refreshToken: null,
      expiresAt: null,
      scope:
        'openid email https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.upload',
      tokenType: 'Bearer',
    });

    const response = await handleYouTubeChannelsCallback(
      callback({ code: 'auth-code', state: state() })
    );

    expect(redirectLocation(response).searchParams.get('youtube_channels')).toBe('connected');
    expect(channels.saveOAuthConnection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sealed: null })
    );
  });

  it('does not call Google when the admin session is missing', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await handleYouTubeChannelsCallback(
      callback({ code: 'auth-code', state: state() })
    );

    expect(redirectLocation(response).searchParams.get('reason')).toBe('unauthorized');
    expect(oauth.exchangeGoogleCode).not.toHaveBeenCalled();
  });
});
