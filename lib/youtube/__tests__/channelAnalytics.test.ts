/** @jest-environment node */

jest.mock('../channels', () => ({
  resolveProjectChannel: jest.fn(),
  loadChannelAccessToken: jest.fn(),
}));

jest.mock('../api', () => ({
  fetchChannelResource: jest.fn(),
  fetchVideoResources: jest.fn(),
  runAnalyticsReport: jest.fn(),
}));

import {
  clearChannelAnalyticsCache,
  getProjectChannelAnalytics,
  mapTopVideos,
} from '../channelAnalytics';

const channelsModule = require('../channels') as {
  resolveProjectChannel: jest.Mock;
  loadChannelAccessToken: jest.Mock;
};
const apiModule = require('../api') as {
  fetchChannelResource: jest.Mock;
  fetchVideoResources: jest.Mock;
  runAnalyticsReport: jest.Mock;
};

const store = {} as never;

function setup() {
  channelsModule.resolveProjectChannel.mockResolvedValue({
    binding: {
      id: 'binding-1',
      projectSlug: 'art-engine',
      channelRecordId: 'channel-record-1',
      channelId: 'UC_art',
      isActive: true,
      updatedAt: null,
    },
    channel: {
      id: 'channel-record-1',
      connectionId: 'connection-1',
      channelId: 'UC_art',
      title: 'Merkurov Art',
      handle: '@merkurov-art',
      uploadsPlaylistId: 'UU_art',
      thumbnailUrl: null,
      status: 'active',
      hiddenSubscriberCount: false,
      subscriberCount: 10,
      viewCount: 100,
      videoCount: 2,
      lastSyncedAt: null,
    },
    connection: {
      id: 'connection-1',
      googleAccountId: 'google-1',
      googleAccountEmail: 'Merckurov@gmail.com',
      googleAccountName: 'Merkurov',
      status: 'connected',
      scopes: [],
      connectedAt: '2026-01-01T00:00:00.000Z',
      lastCheckedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      hasRefreshToken: true,
    },
  });
  channelsModule.loadChannelAccessToken.mockResolvedValue({
    accessToken: 'access-token',
    channel: {
      id: 'channel-record-1',
      connectionId: 'connection-1',
      channelId: 'UC_art',
      title: 'Merkurov Art',
      handle: '@merkurov-art',
      uploadsPlaylistId: 'UU_art',
      thumbnailUrl: null,
      status: 'active',
      hiddenSubscriberCount: false,
      subscriberCount: 10,
      viewCount: 100,
      videoCount: 2,
      lastSyncedAt: null,
    },
    connection: {
      id: 'connection-1',
      googleAccountId: 'google-1',
      googleAccountEmail: 'Merckurov@gmail.com',
      googleAccountName: 'Merkurov',
      status: 'connected',
      scopes: [],
      connectedAt: '2026-01-01T00:00:00.000Z',
      lastCheckedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      hasRefreshToken: true,
    },
  });
  apiModule.fetchChannelResource.mockResolvedValue({
    id: 'UC_art',
    title: 'Merkurov Art',
    handle: '@merkurov-art',
    uploadsPlaylistId: 'UU_art',
    subscribers: 10,
    views: 100,
    videoCount: 2,
    hiddenSubscriberCount: false,
  });
  apiModule.fetchVideoResources.mockResolvedValue([
    { id: 'video_1', title: 'One video', publishedAt: null, durationSeconds: 60, views: 1, likes: 0, comments: 0, isShort: true },
  ]);

  apiModule.runAnalyticsReport.mockImplementation(
    async (_auth: unknown, query: { metrics: string[]; dimensions?: string[] }) => {
      if (query.metrics.includes('videoThumbnailImpressions')) {
        throw new Error('unsupported metric');
      }
      if (query.dimensions?.includes('video')) {
        return {
          headers: ['video', 'views', 'estimatedMinutesWatched', 'averageViewDuration', 'likes', 'comments'],
          rows: [
            {
              date: null,
              dimensions: { video: 'video_1' },
              metrics: {
                views: 50,
                estimatedMinutesWatched: 12,
                averageViewDuration: 30,
                likes: 3,
                comments: 1,
              },
            },
          ],
          totals: { views: 50 },
        };
      }
      if (query.dimensions?.includes('day')) {
        return {
          headers: ['day', 'views', 'estimatedMinutesWatched'],
          rows: [
            {
              date: '2026-11-01',
              dimensions: { day: '2026-11-01' },
              metrics: { views: 20, estimatedMinutesWatched: 4 },
            },
          ],
          totals: { views: 20 },
        };
      }
      return {
        headers: [
          'views',
          'estimatedMinutesWatched',
          'averageViewDuration',
          'averageViewPercentage',
          'subscribersGained',
          'subscribersLost',
          'likes',
          'comments',
          'shares',
        ],
        rows: [],
        totals: {
          views: 120,
          estimatedMinutesWatched: 30,
          averageViewDuration: 42,
          averageViewPercentage: 55,
          subscribersGained: 4,
          subscribersLost: 1,
          likes: 9,
          comments: 2,
          shares: 1,
        },
      };
    }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  clearChannelAnalyticsCache();
  setup();
});

describe('project channel analytics', () => {
  it('returns real metrics, top videos and an explicit unavailable state for impressions', async () => {
    const report = await getProjectChannelAnalytics({
      store,
      ownerId: 'owner-1',
      projectSlug: 'art-engine',
      start: '2026-11-01',
      end: '2026-11-30',
      now: new Date('2026-12-01T00:00:00.000Z'),
    });

    expect(report.bound).toBe(true);
    if (!report.bound) throw new Error('expected bound report');

    expect(report.channel.id).toBe('UC_art');
    expect(report.metrics.find((item) => item.key === 'views')).toMatchObject({
      value: 120,
      available: true,
    });
    expect(report.impressions.every((item) => item.value === null)).toBe(true);
    expect(report.impressions.every((item) => Boolean(item.unavailableReason))).toBe(true);
    expect(report.topVideos[0]).toMatchObject({
      videoId: 'video_1',
      title: 'One video',
      views: 50,
    });
    expect(report.series).toEqual([{ date: '2026-11-01', views: 20, watchMinutes: 4 }]);
    expect(report.limitations.join(' ')).toContain('не подменены нулями');
    expect(JSON.stringify(report)).not.toContain('access-token');
  });

  it('serves a repeated period from cache and bypasses it with fresh=true', async () => {
    await getProjectChannelAnalytics({
      store,
      ownerId: 'owner-1',
      projectSlug: 'art-engine',
      start: '2026-11-01',
      end: '2026-11-30',
    });
    const callsAfterFirst = apiModule.runAnalyticsReport.mock.calls.length;

    const cached = await getProjectChannelAnalytics({
      store,
      ownerId: 'owner-1',
      projectSlug: 'art-engine',
      start: '2026-11-01',
      end: '2026-11-30',
    });

    expect(cached.bound).toBe(true);
    if (cached.bound) expect(cached.cached).toBe(true);
    expect(apiModule.runAnalyticsReport).toHaveBeenCalledTimes(callsAfterFirst);

    await getProjectChannelAnalytics({
      store,
      ownerId: 'owner-1',
      projectSlug: 'art-engine',
      start: '2026-11-01',
      end: '2026-11-30',
      fresh: true,
    });

    expect(apiModule.runAnalyticsReport.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('never reuses a cached report after the project is rebound to another channel', async () => {
    const first = await getProjectChannelAnalytics({
      store,
      ownerId: 'owner-1',
      projectSlug: 'unframed',
      start: '2026-11-01',
      end: '2026-11-30',
    });
    expect(first.bound).toBe(true);
    if (first.bound) expect(first.channel.id).toBe('UC_art');

    const callsAfterFirst = apiModule.runAnalyticsReport.mock.calls.length;
    const original = channelsModule.resolveProjectChannel.getMockImplementation();

    channelsModule.resolveProjectChannel.mockResolvedValue({
      binding: {
        id: 'binding-2',
        projectSlug: 'unframed',
        channelRecordId: 'channel-record-2',
        channelId: 'UC_unframed',
        isActive: true,
        updatedAt: null,
      },
      channel: {
        id: 'channel-record-2',
        connectionId: 'connection-2',
        channelId: 'UC_unframed',
        title: 'UNFRAMED',
        handle: '@unframed-tv',
        uploadsPlaylistId: 'UU_unframed',
        thumbnailUrl: null,
        status: 'active',
        hiddenSubscriberCount: false,
        subscriberCount: 1,
        viewCount: 2,
        videoCount: 3,
        lastSyncedAt: null,
      },
      connection: {
        id: 'connection-2',
        googleAccountId: 'google-2',
        googleAccountEmail: 'unframed@example.com',
        googleAccountName: 'UNFRAMED',
        status: 'connected',
        scopes: [],
        connectedAt: '2026-01-01T00:00:00.000Z',
        lastCheckedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        hasRefreshToken: true,
      },
    });
    channelsModule.loadChannelAccessToken.mockResolvedValueOnce({
      accessToken: 'access-token-b',
      channel: {
        id: 'channel-record-2',
        connectionId: 'connection-2',
        channelId: 'UC_unframed',
        title: 'UNFRAMED',
        handle: '@unframed-tv',
        uploadsPlaylistId: 'UU_unframed',
        thumbnailUrl: null,
        status: 'active',
        hiddenSubscriberCount: false,
        subscriberCount: 1,
        viewCount: 2,
        videoCount: 3,
        lastSyncedAt: null,
      },
      connection: {
        id: 'connection-2',
        googleAccountId: 'google-2',
        googleAccountEmail: 'unframed@example.com',
        googleAccountName: 'UNFRAMED',
        status: 'connected',
        scopes: [],
        connectedAt: '2026-01-01T00:00:00.000Z',
        lastCheckedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        hasRefreshToken: true,
      },
    });

    const rebound = await getProjectChannelAnalytics({
      store,
      ownerId: 'owner-1',
      projectSlug: 'unframed',
      start: '2026-11-01',
      end: '2026-11-30',
    });

    expect(rebound.bound).toBe(true);
    if (rebound.bound) {
      expect(rebound.channel.id).toBe('UC_unframed');
      expect(rebound.cached).toBe(false);
    }
    expect(apiModule.runAnalyticsReport.mock.calls.length).toBeGreaterThan(callsAfterFirst);

    if (original) channelsModule.resolveProjectChannel.mockImplementation(original);
  });

  it('returns an unbound state instead of inventing data for an unbound project', async () => {
    channelsModule.resolveProjectChannel.mockResolvedValueOnce(null);

    const report = await getProjectChannelAnalytics({
      store,
      ownerId: 'owner-1',
      projectSlug: 'unframed',
      start: '2026-11-01',
      end: '2026-11-30',
    });

    expect(report).toMatchObject({ bound: false, projectSlug: 'unframed' });
    expect(apiModule.runAnalyticsReport).not.toHaveBeenCalled();
  });

  it('maps null metric values without turning them into zeros', () => {
    const rows = mapTopVideos([
      {
        date: null,
        dimensions: { video: 'video_2' },
        metrics: { views: null, estimatedMinutesWatched: null },
      },
    ]);

    expect(rows[0]).toMatchObject({
      videoId: 'video_2',
      views: null,
      watchMinutes: null,
      title: null,
    });
  });
});
