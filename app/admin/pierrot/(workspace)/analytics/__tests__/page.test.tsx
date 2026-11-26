/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

import { fixtureDashboard } from '@/lib/analytics/website/__fixtures__/dashboardFixture';

jest.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
}));

jest.mock('@/lib/serverAuth', () => ({
  requireAdmin: jest.fn(async () => ({ id: 'owner-1' })),
  getServerSupabaseClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/analytics/website/tokenCrypto', () => ({
  analyticsEncryptionKeySource: jest.fn(() => 'derived'),
}));

jest.mock('@/lib/analytics/website/config', () => ({
  WEBSITE_ANALYTICS_MEASUREMENT_ID: 'G-TEST',
  getAnalyticsTimezone: jest.fn(() => 'Europe/London'),
  getGoogleOAuthConfig: jest.fn(() => ({
    configured: true,
    missing: [],
    redirectUri: 'https://example.test/api/auth/google-analytics/callback',
  })),
  getUmamiConfig: jest.fn(() => ({ configured: true, missing: [] })),
}));

jest.mock('@/lib/analytics/website/dataset', () => ({
  loadSourceHealth: jest.fn(),
}));

jest.mock('@/lib/analytics/website/dashboard', () => ({
  loadWebsiteDashboard: jest.fn(async () => null),
}));

jest.mock('@/lib/youtube/connection', () => ({
  loadYouTubeConnectionState: jest.fn(),
}));

jest.mock('@/lib/youtube/config', () => ({
  getYouTubeChannelId: jest.fn(() => 'UC_test'),
  getYouTubeDataApiKey: jest.fn(() => null),
}));

jest.mock('@/components/pierrot/workspace/Sparkline', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/analytics/SearchConsoleMonitor', () => ({
  __esModule: true,
  default: () => null,
}));

const { loadSourceHealth } = require('@/lib/analytics/website/dataset') as {
  loadSourceHealth: jest.Mock;
};
const { loadWebsiteDashboard } = require('@/lib/analytics/website/dashboard') as {
  loadWebsiteDashboard: jest.Mock;
};
const { loadYouTubeConnectionState } = require('@/lib/youtube/connection') as {
  loadYouTubeConnectionState: jest.Mock;
};
const { default: AnalyticsPage } = require('../page') as {
  default: (props: { searchParams?: Record<string, string> }) => Promise<unknown>;
};

type SourceOverrides = Record<string, unknown>;

function source(provider: string, label: string, overrides: SourceOverrides = {}) {
  return {
    provider,
    label,
    status: 'connected',
    configured: true,
    connected: true,
    externalId: `${provider}-id`,
    accountLabel: `${label} account`,
    scopes: [],
    externalMeta: null,
    lastCheckedAt: null,
    lastSyncAt: null,
    lastSuccessAt: null,
    lastSyncStatus: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    dataFrom: null,
    dataTo: null,
    actionRequired: null,
    coverage: null,
    dataState: 'complete',
    freshness: 'fresh',
    ...overrides,
  };
}

function health() {
  return {
    sources: [
      source('google_analytics', 'Google Analytics'),
      source('search_console', 'Search Console'),
      source('umami', 'Umami'),
      source('bluesky', 'Bluesky'),
    ],
    runs: [],
  };
}

function youtubeState() {
  return {
    configured: true,
    connected: true,
    status: 'connected',
    channelId: 'UC_test',
    channelTitle: 'Pierrot channel',
    accountLabel: 'Pierrot + UNFRAMED',
    googleAccountEmail: 'owner@example.com',
    scopes: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ],
    missingScopes: [],
    managementAuthorized: false,
    managementScopes: [],
    missingManagementScopes: [],
    managementAuthorizedAt: null,
    projectSlugs: ['pierrot', 'unframed'],
    connectedAt: '2026-01-01T00:00:00.000Z',
    lastCheckedAt: '2026-01-02T00:00:00.000Z',
    lastErrorCode: null,
    lastErrorMessage: null,
  };
}

async function renderPage() {
  return renderToStaticMarkup((await AnalyticsPage({ searchParams: {} })) as never);
}

describe('Pierrot analytics workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadSourceHealth as unknown as jest.Mock).mockResolvedValue(health());
    (loadYouTubeConnectionState as unknown as jest.Mock).mockResolvedValue(youtubeState());
    (loadWebsiteDashboard as unknown as jest.Mock).mockResolvedValue(null);
  });

  it('explains insufficient_permissions with account, resources and owner action', async () => {
    (loadSourceHealth as unknown as jest.Mock).mockResolvedValue({
      sources: [
        source('google_analytics', 'Google Analytics 4', {
          status: 'error',
          connected: true,
          externalId: '244838264',
          accountLabel: 'Merkurov · merkurov.love',
          externalMeta: {
            property_id: '244838264',
            account_id: '176791840',
            google_account_email: 'owner@example.com',
            discovery: { stage: 'runReport:total' },
          },
          lastErrorCode: 'insufficient_permissions',
          lastErrorMessage: 'The Google account does not grant access to this resource.',
          actionRequired:
            'Google Analytics → Admin → Property access management: выдайте owner@example.com роль Viewer (минимум) на property 244838264. После выдачи нажмите «Повторить синхронизацию».',
          minimumRole: 'Viewer',
        }),
        source('search_console', 'Google Search Console', {
          status: 'error',
          connected: true,
          externalId: 'sc-domain:merkurov.love',
          accountLabel: 'sc-domain:merkurov.love',
          externalMeta: {
            site_url: 'sc-domain:merkurov.love',
            google_account_email: 'owner@example.com',
          },
          lastErrorCode: 'insufficient_permissions',
          lastErrorMessage: 'The Google account does not grant access to this resource.',
          actionRequired:
            'Search Console → Settings → Users and permissions: добавьте owner@example.com как Full user или Owner на property sc-domain:merkurov.love.',
          minimumRole: 'Full user или Owner',
        }),
        source('umami', 'Umami'),
        source('bluesky', 'Bluesky'),
      ],
      runs: [],
    });

    const html = await renderPage();

    expect(html).toContain('Google account');
    expect(html).toContain('owner@example.com');
    expect(html).toContain('GA4 property');
    expect(html).toContain('244838264');
    expect(html).toContain('Search Console property');
    expect(html).toContain('sc-domain:merkurov.love');
    expect(html).toContain('Viewer');
    expect(html).toContain('Full user или Owner');
    expect(html).toContain('Действие владельца');
    expect(html).toContain('Повторить синхронизацию');
    expect(html).toContain('action="/api/admin/analytics/sync"');
    expect(html).toContain('name="provider" value="google_analytics"');
    expect(html).toContain('name="provider" value="search_console"');
    expect(html).toContain('Права Google-аккаунта');
    expect(html).not.toContain('refresh_token');
    expect(html).not.toContain('ya29.');
    expect(html).not.toContain('client_secret');
  });

  it('asks for reconnect when the Google grant was revoked', async () => {
    (loadSourceHealth as unknown as jest.Mock).mockResolvedValue({
      sources: [
        source('google_analytics', 'Google Analytics 4', {
          status: 'needs_reauthorization',
          connected: true,
          externalId: '244838264',
          externalMeta: { property_id: '244838264' },
          lastErrorCode: 'invalid_grant',
          actionRequired:
            'Нажмите «Переподключить», выберите нужный Google-аккаунт и подтвердите read-only доступ.',
        }),
        source('search_console', 'Google Search Console'),
        source('umami', 'Umami'),
        source('bluesky', 'Bluesky'),
      ],
      runs: [],
    });

    const html = await renderPage();

    expect(html).toContain('grant отозван или истёк');
    expect(html).toContain('Переподключить');
    expect(html).not.toContain('роль Viewer на property 244838264');
  });

  it('renders read-only YouTube source health without management actions', async () => {
    const html = await renderPage();

    expect(html).toContain('YouTube · Pierrot + UNFRAMED');
    expect(html).toContain('UC_test');
    expect(html).toContain('Диагностика без секретов');
    expect(html).toContain('/api/admin/pierrot/youtube/status');

    expect(html).not.toContain('Управление каналом');
    expect(html).not.toContain('Подключить общий канал');
    expect(html).not.toContain('Переподключить Google');
    expect(html).not.toContain('/api/admin/analytics/connect?provider=youtube');
    expect(html).not.toContain('/api/admin/youtube/management');
    expect(html).not.toContain('video.upload');
    expect(html).not.toContain('Плейлисты');
    expect(html).not.toContain('Комментарии');
    expect(html).not.toContain('Субтитры');
    expect(html).not.toContain('Загрузить (с подтверждением)');
  });

  it('keeps existing website analytics sources intact', async () => {
    const html = await renderPage();

    expect(html).toContain('Google Analytics');
    expect(html).toContain('Search Console');
    expect(html).toContain('Umami');
    expect(html).toContain('Bluesky');
    expect(html).toContain('Синхронизировать всё');
  });

  it('does not import the legacy YouTube management component', () => {
    const file = readFileSync(
      path.join(process.cwd(), 'app/admin/pierrot/(workspace)/analytics/page.tsx'),
      'utf8'
    );

    expect(file).not.toMatch(/YouTubeChannelManager/);
    expect(file).not.toMatch(/\/api\/admin\/youtube\/management/);
    expect(file).not.toMatch(/youtube_management/);
  });

  it('renders a full current-schema dashboard payload', async () => {
    (loadWebsiteDashboard as unknown as jest.Mock).mockResolvedValue(fixtureDashboard());

    const html = await renderPage();

    expect(html).toContain('Подтверждённые подписчики');
    expect(html).toContain('42');
    expect(html).toContain('Ошибки отправки подтверждения');
    expect(html).toContain('>5<');
    expect(html).not.toContain('создан по старой схеме');
  });

  it('does not render an old cached dashboard as current data', async () => {
    (loadWebsiteDashboard as unknown as jest.Mock).mockResolvedValue(
      fixtureDashboard({ schemaVersion: 1 })
    );

    const html = await renderPage();

    expect(html).toContain('создан по старой схеме');
    expect(html).toContain('Подтверждённые подписчики');
    expect(html).not.toContain('>42<');
    expect(html).not.toContain('Ошибки доставки писем</dt><dd>100');
  });

  it('does not crash when newsletter signals are missing from the cached payload', async () => {
    const payload = fixtureDashboard();
    const dataset = payload.dataset as Record<string, unknown>;
    const internal = dataset.internal as Record<string, unknown>;
    const newsletter = internal.newsletter as Record<string, unknown>;
    delete newsletter.signals;
    (loadWebsiteDashboard as unknown as jest.Mock).mockResolvedValue(payload);

    const html = await renderPage();

    expect(html).toContain('Ошибки отправки подтверждения');
    expect(html).toContain('Сигналы рассылки');
    expect(html).not.toContain('создан по старой схеме');
  });
});
