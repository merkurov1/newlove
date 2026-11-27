/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(),
  getServerSupabaseClient: jest.fn(() => ({})),
  explainAdminDenial: jest.fn(async () => 'not_authenticated'),
}));

jest.mock('@/lib/youtube/channels', () => ({
  isYouTubeProjectSlug: (value: unknown) =>
    ['art-engine', 'unframed', 'pierrot', 'heart-and-angel'].includes(String(value)),
  checkYouTubeMultichannelSchema: jest.fn(async () => ({
    ready: true,
    reason: 'ready',
    missingTables: [],
    code: null,
  })),
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
  checkYouTubeMultichannelSchema: jest.Mock;
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
  channels.checkYouTubeMultichannelSchema.mockResolvedValue({
    ready: true,
    reason: 'ready',
    missingTables: [],
    code: null,
  });
  oauth.probeGoogleConsentUrl.mockResolvedValue({ ok: true, reason: null });
});

afterAll(() => {
  process.env = originalEnv;
});

describe('GET /api/admin/youtube/channels/connect', () => {
  it('redirects a visitor back with an explicit admin diagnostics reason', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/channels/connect?project=art-engine')
    );

    expect(response.status).toBe(307);

    const location = new URL(response.headers.get('location') || '');
    expect(location.pathname).toBe('/admin/pierrot/youtube');
    expect(location.searchParams.get('youtube_channels')).toBe('error');
    expect(location.searchParams.get('reason')).toBe('not_authenticated');
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
    expect(response.headers.get('set-cookie')).toContain('pierrot_youtube_channels_oauth');
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
    channels.checkYouTubeMultichannelSchema.mockResolvedValueOnce({
      ready: false,
      reason: 'missing_tables',
      missingTables: ['youtube_channels'],
      code: 'PGRST205',
    });

    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/channels/connect?project=art-engine')
    );

    const location = new URL(response.headers.get('location') || '');
    expect(response.status).toBe(307);
    expect(location.searchParams.get('reason')).toBe('migration_required');
    expect(location.searchParams.get('missing')).toBe('youtube_channels');
    expect(oauth.probeGoogleConsentUrl).not.toHaveBeenCalled();
  });

  it('returns to the page with a precise notice when OAuth preflight fails', async () => {
    oauth.probeGoogleConsentUrl.mockResolvedValueOnce({
      ok: false,
      reason: 'redirect_uri_mismatch',
    });

    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/channels/connect?project=unframed')
    );

    const location = new URL(response.headers.get('location') || '');
    expect(response.status).toBe(307);
    expect(location.pathname).toBe('/admin/pierrot/youtube');
    expect(location.searchParams.get('youtube_channels')).toBe('error');
    expect(location.searchParams.get('reason')).toBe('redirect_uri_mismatch');
    expect(location.searchParams.get('project')).toBe('unframed');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('returns to the page instead of raw JSON when Google OAuth is not configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;

    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/channels/connect?project=art-engine')
    );

    const location = new URL(response.headers.get('location') || '');
    expect(response.status).toBe(307);
    expect(location.pathname).toBe('/admin/pierrot/youtube');
    expect(location.searchParams.get('youtube_channels')).toBe('error');
    expect(location.searchParams.get('reason')).toBe('google_oauth_not_configured');
    expect(location.searchParams.get('missing')).toContain('GOOGLE_CLIENT_ID');
    expect(oauth.probeGoogleConsentUrl).not.toHaveBeenCalled();
  });
});
