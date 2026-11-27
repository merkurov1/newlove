/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let mockCookieValue: string | undefined = 'nonce-1';

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({
    get: (name: string) =>
      name === 'pierrot_youtube_channels_oauth' && mockCookieValue
        ? { name, value: mockCookieValue }
        : undefined,
  })),
}));

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(),
  getServerSupabaseClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/analytics/website/providers/oauth', () => ({
  exchangeGoogleCode: jest.fn(),
  fetchGoogleUserInfo: jest.fn(),
}));

jest.mock('@/lib/analytics/website/tokenCrypto', () => {
  const actual = jest.requireActual('@/lib/analytics/website/tokenCrypto');
  return {
    ...actual,
    sealSecret: jest.fn(() => ({
      ciphertext: 'sealed-ciphertext',
      iv: 'sealed-iv',
      tag: 'sealed-tag',
      keyVersion: 'v1:test',
    })),
  };
});

jest.mock('@/lib/youtube/api', () => ({
  listMyChannels: jest.fn(),
}));

jest.mock('@/lib/youtube/channels', () => ({
  isYouTubeProjectSlug: (value: unknown) =>
    ['art-engine', 'unframed', 'pierrot', 'heart-and-angel'].includes(String(value)),
  saveOAuthConnection: jest.fn(),
  replaceConnectionChannels: jest.fn(),
}));

const { handleYouTubeChannelsCallback } = require('../channelsCallback') as {
  handleYouTubeChannelsCallback: (request: Request) => Promise<Response>;
};
const { signState } = require('@/lib/analytics/website/tokenCrypto') as {
  signState: (payload: Record<string, unknown>, secret: string) => string;
};
const serverAuth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: jest.Mock;
};
const oauth = require('@/lib/analytics/website/providers/oauth') as {
  exchangeGoogleCode: jest.Mock;
  fetchGoogleUserInfo: jest.Mock;
};
const youtubeApi = require('@/lib/youtube/api') as { listMyChannels: jest.Mock };
const channels = require('@/lib/youtube/channels') as {
  saveOAuthConnection: jest.Mock;
  replaceConnectionChannels: jest.Mock;
};

const SECRET = 'test-sync-secret';
const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
];

const originalEnv = { ...process.env };

function state(overrides: Record<string, unknown> = {}): string {
  return signState(
    {
      uid: 'owner-1',
      purpose: 'youtube_channels',
      project: 'art-engine',
      nonce: 'nonce-1',
      exp: Date.now() + 60_000,
      ...overrides,
    },
    SECRET
  );
}

function callbackRequest(input: {
  stateValue?: string | null;
  code?: string;
  error?: string;
}): Request {
  const url = new URL('https://www.merkurov.love/api/auth/youtube-management/callback');
  if (input.code !== undefined) url.searchParams.set('code', input.code);
  if (input.stateValue !== null) {
    url.searchParams.set('state', input.stateValue ?? state());
  }
  if (input.error) url.searchParams.set('error', input.error);
  return new Request(url);
}

function location(response: Response): URL {
  return new URL(response.headers.get('location') || '');
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
  process.env.ANALYTICS_SYNC_SECRET = SECRET;
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.merkurov.love';
  mockCookieValue = 'nonce-1';

  serverAuth.requireAdminFromRequest.mockResolvedValue({
    id: 'owner-1',
    role: 'ADMIN',
  });
  oauth.exchangeGoogleCode.mockResolvedValue({
    accessToken: 'access-token-secret',
    refreshToken: 'refresh-token-secret',
    expiresAt: null,
    scope: REQUIRED_SCOPES.join(' '),
    tokenType: 'Bearer',
  });
  oauth.fetchGoogleUserInfo.mockResolvedValue({
    email: 'owner@example.com',
    name: 'Owner',
    subject: 'google-1',
  });
  channels.saveOAuthConnection.mockResolvedValue({
    id: 'connection-1',
    googleAccountEmail: 'owner@example.com',
  });
  youtubeApi.listMyChannels.mockResolvedValue({
    channels: [
      {
        channelId: 'UC_art',
        title: 'Merkurov Art',
        handle: '@merkurov-art',
        uploadsPlaylistId: 'UU_art',
        thumbnailUrl: null,
        hiddenSubscriberCount: false,
        subscriberCount: 10,
        viewCount: 100,
        videoCount: 2,
      },
    ],
    truncated: false,
  });
  channels.replaceConnectionChannels.mockResolvedValue([]);
});

afterAll(() => {
  process.env = originalEnv;
});

describe('YouTube multi-channel OAuth callback', () => {
  it('verifies signed state and nonce, seals the token and persists discovered channels', async () => {
    const response = await handleYouTubeChannelsCallback(
      callbackRequest({ code: 'authorization-code' })
    );
    const target = location(response);

    expect(target.pathname).toBe('/admin/pierrot/youtube');
    expect(target.searchParams.get('youtube_channels')).toBe('connected');
    // The account email stays in the database/UI and must never be written to
    // access logs, browser history or Referer headers.
    expect(target.searchParams.get('account')).toBeNull();
    expect(target.searchParams.get('channels')).toBe('1');
    expect(target.searchParams.get('project')).toBe('art-engine');

    expect(oauth.exchangeGoogleCode).toHaveBeenCalledWith(
      'authorization-code',
      expect.objectContaining({
        redirectUri: 'https://www.merkurov.love/api/auth/youtube-management/callback',
      })
    );
    expect(channels.saveOAuthConnection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerId: 'owner-1',
        googleAccountEmail: 'owner@example.com',
        scopes: REQUIRED_SCOPES,
        sealed: expect.objectContaining({ ciphertext: 'sealed-ciphertext' }),
      })
    );
    expect(channels.replaceConnectionChannels).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        connectionId: 'connection-1',
        ownerId: 'owner-1',
        channels: expect.arrayContaining([expect.objectContaining({ channelId: 'UC_art' })]),
      })
    );

    const serialized = target.toString();
    expect(serialized).not.toContain('access-token-secret');
    expect(serialized).not.toContain('refresh-token-secret');
    expect(serialized).not.toContain('sealed-ciphertext');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('uses the same dedicated redirect URI during token exchange when configured', async () => {
    process.env.YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI =
      'https://www.merkurov.love/api/auth/youtube-channels/callback';

    const response = await handleYouTubeChannelsCallback(
      callbackRequest({ code: 'authorization-code' })
    );

    expect(location(response).searchParams.get('youtube_channels')).toBe('connected');
    expect(oauth.exchangeGoogleCode).toHaveBeenCalledWith(
      'authorization-code',
      expect.objectContaining({
        redirectUri: 'https://www.merkurov.love/api/auth/youtube-channels/callback',
      })
    );
  });

  it('rejects a missing nonce cookie before exchanging the code', async () => {
    mockCookieValue = undefined;

    const response = await handleYouTubeChannelsCallback(
      callbackRequest({ code: 'authorization-code' })
    );
    const target = location(response);

    expect(target.searchParams.get('youtube_channels')).toBe('error');
    expect(target.searchParams.get('reason')).toBe('invalid_state');
    expect(target.searchParams.get('project')).toBe('art-engine');
    expect(oauth.exchangeGoogleCode).not.toHaveBeenCalled();
    expect(channels.saveOAuthConnection).not.toHaveBeenCalled();
  });

  it('rejects a tampered state signature before exchanging the code', async () => {
    const tampered = `${state().split('.')[0]}.not-the-signature`;

    const response = await handleYouTubeChannelsCallback(
      callbackRequest({ code: 'authorization-code', stateValue: tampered })
    );

    expect(location(response).searchParams.get('reason')).toBe('invalid_state');
    expect(oauth.exchangeGoogleCode).not.toHaveBeenCalled();
  });

  it('does not persist a grant that is missing required scopes', async () => {
    oauth.exchangeGoogleCode.mockResolvedValueOnce({
      accessToken: 'access-token-secret',
      refreshToken: 'refresh-token-secret',
      expiresAt: null,
      scope: 'https://www.googleapis.com/auth/youtube.readonly',
      tokenType: 'Bearer',
    });

    const response = await handleYouTubeChannelsCallback(
      callbackRequest({ code: 'authorization-code' })
    );
    const target = location(response);

    expect(target.searchParams.get('youtube_channels')).toBe('error');
    expect(target.searchParams.get('reason')).toBe('missing_scopes');
    expect(target.searchParams.get('missing')).toContain('yt-analytics.readonly');
    expect(target.searchParams.get('missing')).toContain('youtube.upload');
    expect(channels.saveOAuthConnection).not.toHaveBeenCalled();
    expect(channels.replaceConnectionChannels).not.toHaveBeenCalled();
  });

  it('accepts a broader Google grant that aliases the narrower requested scopes', async () => {
    oauth.exchangeGoogleCode.mockResolvedValueOnce({
      accessToken: 'access-token-secret',
      refreshToken: 'refresh-token-secret',
      expiresAt: null,
      scope: [
        'https://www.googleapis.com/auth/youtube',
        'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
      ].join(' '),
      tokenType: 'Bearer',
    });

    const response = await handleYouTubeChannelsCallback(
      callbackRequest({ code: 'authorization-code' })
    );

    expect(location(response).searchParams.get('youtube_channels')).toBe('connected');
    expect(channels.saveOAuthConnection).toHaveBeenCalled();
  });

  it('reports an identity lookup failure without persisting a grant', async () => {
    oauth.fetchGoogleUserInfo.mockRejectedValueOnce(new Error('userinfo unavailable'));

    const response = await handleYouTubeChannelsCallback(
      callbackRequest({ code: 'authorization-code' })
    );
    const target = location(response);

    expect(target.searchParams.get('youtube_channels')).toBe('error');
    expect(target.searchParams.get('reason')).toBe('google_identity_unavailable');
    expect(channels.saveOAuthConnection).not.toHaveBeenCalled();
    expect(target.toString()).not.toContain('access-token-secret');
    expect(target.toString()).not.toContain('refresh-token-secret');
  });

  it('keeps the saved account and reports a precise error when channel discovery fails', async () => {
    youtubeApi.listMyChannels.mockRejectedValueOnce(
      Object.assign(new Error('YouTube quota exceeded'), { code: 'quota_exceeded' })
    );

    const response = await handleYouTubeChannelsCallback(
      callbackRequest({ code: 'authorization-code' })
    );
    const target = location(response);

    expect(target.searchParams.get('youtube_channels')).toBe('channels_failed');
    expect(target.searchParams.get('reason')).toBe('quota_exceeded');
    expect(target.searchParams.get('account')).toBeNull();
    expect(target.searchParams.get('project')).toBe('art-engine');
    expect(channels.saveOAuthConnection).toHaveBeenCalled();
    expect(channels.replaceConnectionChannels).not.toHaveBeenCalled();
    expect(target.toString()).not.toContain('access-token-secret');
    expect(target.toString()).not.toContain('refresh-token-secret');
  });

  it('does not persist anything when Google rejects the token exchange', async () => {
    oauth.exchangeGoogleCode.mockRejectedValueOnce(
      Object.assign(new Error('invalid_grant'), { code: 'invalid_grant' })
    );

    const response = await handleYouTubeChannelsCallback(
      callbackRequest({ code: 'authorization-code' })
    );
    const target = location(response);

    expect(target.searchParams.get('youtube_channels')).toBe('error');
    expect(target.searchParams.get('reason')).toBe('invalid_grant');
    expect(channels.saveOAuthConnection).not.toHaveBeenCalled();
    expect(channels.replaceConnectionChannels).not.toHaveBeenCalled();
  });

  it('marks discovery incomplete when Google paginates past the page cap', async () => {
    youtubeApi.listMyChannels.mockResolvedValueOnce({
      channels: [
        {
          channelId: 'UC_art',
          title: 'Merkurov Art',
          handle: '@merkurov-art',
          uploadsPlaylistId: 'UU_art',
          thumbnailUrl: null,
          hiddenSubscriberCount: false,
          subscriberCount: 10,
          viewCount: 100,
          videoCount: 2,
        },
      ],
      truncated: true,
    });

    const response = await handleYouTubeChannelsCallback(
      callbackRequest({ code: 'authorization-code' })
    );
    const target = location(response);

    expect(target.searchParams.get('youtube_channels')).toBe('connected');
    expect(target.searchParams.get('truncated')).toBe('1');
    // A truncated page chain must not be treated as proof that omitted
    // channels lost access.
    expect(channels.replaceConnectionChannels).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        complete: false,
        channels: expect.any(Array),
      })
    );
  });

  it('refuses to invent an account email when Google returns only a subject', async () => {
    oauth.fetchGoogleUserInfo.mockResolvedValueOnce({
      email: null,
      name: 'Owner',
      subject: 'google-1',
    });

    const response = await handleYouTubeChannelsCallback(
      callbackRequest({ code: 'authorization-code' })
    );
    const target = location(response);

    expect(target.searchParams.get('youtube_channels')).toBe('error');
    expect(target.searchParams.get('reason')).toBe('google_identity_unavailable');
    expect(channels.saveOAuthConnection).not.toHaveBeenCalled();
    expect(target.toString()).not.toContain('google.invalid');
  });

  it('logs only safe callback diagnostics, never codes, tokens or email', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    oauth.exchangeGoogleCode.mockRejectedValueOnce(
      Object.assign(new Error('invalid_grant'), { code: 'invalid_grant' })
    );

    try {
      await handleYouTubeChannelsCallback(callbackRequest({ code: 'authorization-code' }));

      expect(warn).toHaveBeenCalledWith(
        '[youtube-channels-callback] failed',
        expect.objectContaining({
          stage: 'token_exchange',
          reason: 'invalid_grant',
          project: 'art-engine',
        })
      );

      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).not.toContain('authorization-code');
      expect(logged).not.toContain('owner@example.com');
      expect(logged).not.toContain('refresh-token-secret');
      expect(logged).not.toContain('access-token-secret');
    } finally {
      warn.mockRestore();
    }
  });
});
