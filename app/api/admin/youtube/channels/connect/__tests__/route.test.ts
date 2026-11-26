/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(),
  getServerSupabaseClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/youtube/channels', () => ({
  isYouTubeProjectSlug: (value: unknown) =>
    ['art-engine', 'unframed', 'pierrot', 'heart-and-angel'].includes(String(value)),
  youtubeMultichannelSchemaReady: jest.fn(async () => true),
}));

jest.mock('@/lib/analytics/website/providers/oauth', () => {
  const actual = jest.requireActual('@/lib/analytics/website/providers/oauth');
  return {
    ...actual,
    probeGoogleConsentUrl: jest.fn(async () => ({ ok: true, reason: null })),
  };
});

const { GET } = require('../route') as { GET: (request: Request) => Promise<Response> };
const serverAuth = require('@/lib/serverAuth') as { requireAdminFromRequest: jest.Mock };
const oauth = require('@/lib/analytics/website/providers/oauth') as {
  probeGoogleConsentUrl: jest.Mock;
};
const channels = require('@/lib/youtube/channels') as {
  youtubeMultichannelSchemaReady: jest.Mock;
};

const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.merkurov.love';
  delete process.env.YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI;
  serverAuth.requireAdminFromRequest.mockResolvedValue({ id: 'owner-1', role: 'ADMIN' });
  channels.youtubeMultichannelSchemaReady.mockResolvedValue(true);
  oauth.probeGoogleConsentUrl.mockResolvedValue({ ok: true, reason: null });
});

afterAll(() => {
  process.env = originalEnv;
});

describe('GET /api/admin/youtube/channels/connect', () => {
  it('rejects visitors', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/channels/connect?project=art-engine')
    );

    expect(response.status).toBe(401);
  });

  it('builds a dedicated state-protected consent URL with least-privilege scopes', async () => {
    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/channels/connect?project=art-engine')
    );

    expect(response.status).toBe(307);
    const location = response.headers.get('location') || '';
    const url = new URL(location);

    expect(url.hostname).toBe('accounts.google.com');
    // Reuses the already-registered management callback by default.
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://www.merkurov.love/api/auth/youtube-management/callback'
    );
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toContain('select_account');
    expect(url.searchParams.get('state')).toEqual(expect.any(String));
    expect(url.searchParams.get('scope')).toContain('youtube.readonly');
    expect(url.searchParams.get('scope')).toContain('yt-analytics.readonly');
    expect(url.searchParams.get('scope')).toContain('youtube.upload');
    expect(url.searchParams.get('scope')).not.toContain('youtube.force-ssl');
    const cookie = response.headers.get('set-cookie') || '';
    expect(cookie).toContain('pierrot_youtube_channels_oauth');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('HttpOnly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
    expect(cookie).toContain('Max-Age=600');
  });

  it('honours an explicit login_hint and can suppress the account chooser', async () => {
    const response = await GET(
      new Request(
        'https://www.merkurov.love/api/admin/youtube/channels/connect?project=unframed&login_hint=unframed%40example.com&select_account=false'
      )
    );
    const url = new URL(response.headers.get('location') || '');

    expect(url.searchParams.get('login_hint')).toBe('unframed@example.com');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('prompt')).not.toContain('select_account');
  });

  it('supports an explicitly configured dedicated redirect URI', async () => {
    process.env.YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI =
      'https://www.merkurov.love/api/auth/youtube-channels/callback';

    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/channels/connect?project=unframed')
    );
    const url = new URL(response.headers.get('location') || '');

    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://www.merkurov.love/api/auth/youtube-channels/callback'
    );
  });

  it('requests the migration before starting OAuth when the schema is absent', async () => {
    channels.youtubeMultichannelSchemaReady.mockResolvedValueOnce(false);

    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/channels/connect?project=art-engine')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('reason=migration_required');
    expect(oauth.probeGoogleConsentUrl).not.toHaveBeenCalled();
  });
});
