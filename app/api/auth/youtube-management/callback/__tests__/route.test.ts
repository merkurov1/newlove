/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/analytics/website/config', () => ({
  getSyncOwnerSecret: jest.fn(() => 'test-secret'),
  getYouTubeManagementRedirectUri: jest.fn(
    () => 'https://www.merkurov.love/api/auth/youtube-management/callback'
  ),
}));

jest.mock('@/lib/analytics/website/tokenCrypto', () => ({
  verifyState: jest.fn(() => ({ purpose: 'youtube_channels' })),
  sealSecret: jest.fn(),
}));

jest.mock('@/lib/youtube/channelsCallback', () => ({
  handleYouTubeChannelsCallback: jest.fn(
    async () =>
      new Response(JSON.stringify({ delegated: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
  ),
}));

jest.mock('@/lib/youtube/discovery', () => ({
  runYouTubeManagementDiscovery: jest.fn(),
}));

jest.mock('@/lib/analytics/website/providers/oauth', () => ({
  exchangeGoogleCode: jest.fn(),
  fetchGoogleUserInfo: jest.fn(),
}));

jest.mock('@/lib/analytics/website/store', () => ({
  getStoredConnection: jest.fn(),
}));

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(),
  requireAdminFromRequest: jest.fn(),
}));

const { GET } = require('../route') as { GET: (request: Request) => Promise<Response> };
const channelsCallback = require('@/lib/youtube/channelsCallback') as {
  handleYouTubeChannelsCallback: jest.Mock;
};
const discovery = require('@/lib/youtube/discovery') as {
  runYouTubeManagementDiscovery: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('/api/auth/youtube-management/callback multi-channel delegation', () => {
  it('hands a signed youtube_channels state to the dedicated handler without touching the legacy grant', async () => {
    const request = new Request(
      'https://www.merkurov.love/api/auth/youtube-management/callback?code=abc&state=signed-state'
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ delegated: true });
    expect(channelsCallback.handleYouTubeChannelsCallback).toHaveBeenCalledWith(request);
    expect(discovery.runYouTubeManagementDiscovery).not.toHaveBeenCalled();
  });
});
