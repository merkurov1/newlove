/** @jest-environment node */

import type { YouTubePeriod } from '../types';
import { YouTubeError } from '../types';

const fetchChannelResource = jest.fn();
const fetchVideoResources = jest.fn();
const runAnalyticsReport = jest.fn();
const loadYouTubeConnectionState = jest.fn();
const loadYouTubeAccessToken = jest.fn();
const saveSnapshot = jest.fn(async () => undefined);

jest.mock('../api', () => ({
  fetchChannelResource: (...args: unknown[]) => fetchChannelResource(...args),
  fetchVideoResources: (...args: unknown[]) => fetchVideoResources(...args),
  runAnalyticsReport: (...args: unknown[]) => runAnalyticsReport(...args),
}));

jest.mock('../connection', () => ({
  loadYouTubeConnectionState: () => loadYouTubeConnectionState(),
  loadYouTubeAccessToken: () => loadYouTubeAccessToken(),
}));

jest.mock('@/lib/analytics/website/store', () => ({
  saveSnapshot: (...args: unknown[]) => saveSnapshot(...args),
}));

const { buildYouTubeReport } = require('../service') as typeof import('../service');

const PERIOD: YouTubePeriod = {
  key: 'last_30_days',
  label: '1 нояб. 2026 — 30 нояб. 2026',
  timezone: 'Europe/London',
  start: '2026-11-01',
  end: '2026-11-30',
  previousStart: '2026-10-02',
  previousEnd: '2026-10-31',
  previousLabel: '2 окт. 2026 — 31 окт. 2026',
  comparison: true,
};

const store = {} as never;

function connectionState() {
  return {
    configured: true,
    connected: true,
    status: 'connected',
    channelId: 'UC_shared',
    channelTitle: 'Pierrot + UNFRAMED',
    accountLabel: 'Pierrot + UNFRAMED',
    scopes: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ],
    missingScopes: [],
    connectedAt: '2026-11-01T00:00:00.000Z',
    lastCheckedAt: '2026-11-30T10:00:00.000Z',
    lastErrorCode: null,
    lastErrorMessage: null,
  };
}

beforeAll(() => {
  process.env.YOUTUBE_API_KEY = 'test-public-data-key';
  process.env.YOUTUBE_CHANNEL_ID = 'UC_shared';
});

afterAll(() => {
  delete process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_CHANNEL_ID;
});

beforeEach(() => {
  jest.clearAllMocks();
  loadYouTubeConnectionState.mockResolvedValue(connectionState());
  loadYouTubeAccessToken.mockResolvedValue({
    accessToken: 'server-token',
    connection: { id: 'conn-youtube' },
  });
  fetchChannelResource.mockResolvedValue({
    id: 'UC_shared',
    title: 'Pierrot + UNFRAMED',
    handle: '@shared',
    uploadsPlaylistId: 'UU_shared',
    subscribers: 1200,
    views: 90000,
    videoCount: 44,
    hiddenSubscriberCount: false,
  });
  fetchVideoResources.mockImplementation(async (_auth, ids: string[]) =>
    ids.map((id: string) => ({
      id,
      title: id === 'TmC6Lr5K4R8' ? 'The Spectral Tiger' : 'Step Out of the Physical Container',
      publishedAt: '2026-11-01T10:00:00.000Z',
      durationSeconds: id === 'TmC6Lr5K4R8' ? 45 : 70,
      views: id === 'TmC6Lr5K4R8' ? 1000 : 2000,
      likes: id === 'TmC6Lr5K4R8' ? 10 : 20,
      comments: id === 'TmC6Lr5K4R8' ? 1 : 2,
      isShort: id === 'TmC6Lr5K4R8',
    }))
  );
});

describe('shared YouTube channel reports', () => {
  it('compares two videos from the same shared channel and keeps project context separate', async () => {
    runAnalyticsReport.mockImplementation(async (_auth, query) => {
      const video = query.filters?.video;
      const views = video === 'TmC6Lr5K4R8' ? 300 : 700;

      return {
        headers: ['views', 'estimatedMinutesWatched'],
        rows: [],
        totals: { views, estimatedMinutesWatched: views / 2 },
      };
    });

    const report = await buildYouTubeReport('compare_videos', {
      store,
      period: PERIOD,
      language: 'ru',
      videoIds: ['TmC6Lr5K4R8', 'ZGhmmDVVwQg'],
      fresh: true,
      now: new Date('2026-12-01T10:00:00.000Z'),
    });

    expect(report.channelId).toBe('UC_shared');
    expect(report.videoAnalytics).toHaveLength(2);
    expect(report.videoAnalytics[0].metrics.find((metric) => metric.key === 'views')?.value).toBe(
      300
    );
    expect(report.videoAnalytics[1].metrics.find((metric) => metric.key === 'views')?.value).toBe(
      700
    );
    expect(report.videoAnalytics[0].project).toContain('UNFRAMED');
    expect(report.provenance.fetchedAt).toBe('2026-12-01T10:00:00.000Z');
    expect(report.sharedProjects.map((project) => project.slug)).toEqual(['pierrot', 'unframed']);
    expect(JSON.stringify(report)).not.toContain('server-token');
  });

  it('compares periods with previous values and deltas only when both sides exist', async () => {
    runAnalyticsReport.mockImplementation(async (_auth, query) => {
      const views = query.startDate === PERIOD.start ? 150 : 100;

      return {
        headers: ['views', 'estimatedMinutesWatched', 'subscribersGained'],
        rows: [],
        totals: {
          views,
          estimatedMinutesWatched: null,
          subscribersGained: query.startDate === PERIOD.start ? 5 : null,
        },
      };
    });

    const report = await buildYouTubeReport('compare_periods', {
      store,
      period: PERIOD,
      language: 'ru',
      fresh: true,
    });

    const views = report.metrics.find((metric) => metric.key === 'views');
    const watch = report.metrics.find((metric) => metric.key === 'estimatedMinutesWatched');
    const gained = report.metrics.find((metric) => metric.key === 'subscribersGained');

    expect(views?.value).toBe(150);
    expect(views?.previous).toBe(100);
    expect(views?.deltaPercent).toBeCloseTo(50);
    expect(watch?.available).toBe(false);
    expect(watch?.value).toBeNull();
    expect(gained?.previous).toBeNull();
    expect(gained?.deltaPercent).toBeNull();
    expect(report.comparisonPeriod?.start).toBe(PERIOD.previousStart);
  });

  it('does not turn a permission failure into zeros or invent analytics', async () => {
    loadYouTubeAccessToken.mockRejectedValue(
      new YouTubeError({
        code: 'insufficient_permissions',
        message: 'scope missing',
      })
    );

    const report = await buildYouTubeReport('channel_overview', {
      store,
      period: PERIOD,
      language: 'ru',
      fresh: true,
    });

    const publicViews = report.metrics.find((metric) => metric.key === 'public_views');
    const periodViews = report.metrics.find((metric) => metric.key === 'views');

    expect(publicViews?.value).toBe(90000);
    expect(publicViews?.source).toBe('youtube_data_api');
    expect(report.analyticsAvailable).toBe(false);
    expect(periodViews?.available).toBe(false);
    expect(periodViews?.value).toBeNull();
    expect(periodViews?.unavailableReason).toContain('scopes');
    expect(report.dataState).toBe('partial');
    expect(runAnalyticsReport).not.toHaveBeenCalled();
  });

  it('keeps an empty Analytics response unavailable instead of writing zero', async () => {
    runAnalyticsReport.mockResolvedValue({
      headers: [],
      rows: [],
      totals: {},
    });

    const report = await buildYouTubeReport('channel_overview', {
      store,
      period: PERIOD,
      language: 'en',
      fresh: true,
    });

    const views = report.metrics.find((metric) => metric.key === 'views');
    expect(views?.value).toBeNull();
    expect(views?.available).toBe(false);
    expect(views?.unavailableReason).toBeTruthy();
    expect(report.dataState).toBe('partial');
  });
});
