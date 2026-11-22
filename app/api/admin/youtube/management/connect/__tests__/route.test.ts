/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => ({ id: 'owner-1', role: 'ADMIN' })),
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

const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.merkurov.love';
  delete process.env.ANALYTICS_GOOGLE_REDIRECT_URI;
  delete process.env.YOUTUBE_MANAGEMENT_GOOGLE_REDIRECT_URI;
  serverAuth.requireAdminFromRequest.mockResolvedValue({ id: 'owner-1', role: 'ADMIN' });
  oauth.probeGoogleConsentUrl.mockResolvedValue({ ok: true, reason: null });
});

describe('GET /api/admin/youtube/management/connect', () => {
  it('always presents an account chooser and does not force the site-login email', async () => {
    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/management/connect?project=unframed')
    );
    const location = new URL(String(response.headers.get('location')));

    expect(response.status).toBe(307);
    expect(location.searchParams.get('prompt')).toBe('consent select_account');
    expect(location.searchParams.get('login_hint')).toBeNull();
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://www.merkurov.love/api/auth/youtube-management/callback'
    );
    expect(location.searchParams.get('scope')).toContain(
      'https://www.googleapis.com/auth/youtube.upload'
    );
    expect(location.searchParams.get('scope')).not.toContain('yt-analytics.readonly');

    const cookie = String(response.headers.get('set-cookie'));
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
    expect(cookie).toContain('Path=/api/auth/youtube-management');
  });

  it('passes an explicit login hint only when the owner supplies it', async () => {
    const response = await GET(
      new Request(
        'https://www.merkurov.love/api/admin/youtube/management/connect?login_hint=unframed%40example.com'
      )
    );
    const location = new URL(String(response.headers.get('location')));

    expect(location.searchParams.get('login_hint')).toBe('unframed@example.com');
    expect(location.searchParams.get('prompt')).toContain('select_account');
  });

  it('rejects visitors before building a consent URL', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/management/connect')
    );

    expect(response.status).toBe(401);
    expect(oauth.probeGoogleConsentUrl).not.toHaveBeenCalled();
  });
});
