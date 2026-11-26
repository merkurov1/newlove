import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  fetchChannelResource,
  fetchVideoResources,
  runAnalyticsReport,
  type YouTubeAnalyticsMetric,
  type YouTubeAnalyticsRow,
} from './api';
import { createReportCache } from './cache';
import {
  YOUTUBE_REPORTING_DELAY_DAYS,
  getYouTubeCacheTtlSeconds,
  getYouTubeTimezone,
} from './config';
import {
  loadChannelAccessToken,
  resolveProjectChannel,
  type SafeOAuthConnection,
  type YouTubeChannelRecord,
} from './channels';
import { YouTubeError } from './types';

assertServerOnly('lib/youtube/channelAnalytics');

/**
 * Project-scoped channel analytics.
 *
 * Every report is keyed by channel + period, uses at most four Analytics
 * queries and one Data API lookup, and is cached in-process for a bounded TTL.
 * Missing metrics stay `null` with an explicit reason: they are never replaced
 * with zero.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const CHANNEL_METRICS: YouTubeAnalyticsMetric[] = [
  'views',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'averageViewPercentage',
  'subscribersGained',
  'subscribersLost',
  'likes',
  'comments',
  'shares',
];

const TOP_VIDEO_METRICS: YouTubeAnalyticsMetric[] = [
  'views',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'likes',
  'comments',
];

const cache = createReportCache<ChannelAnalyticsReport>(getYouTubeCacheTtlSeconds());

export type ChannelAnalyticsMetric = {
  key: string;
  label: string;
  value: number | null;
  unit: 'count' | 'seconds' | 'percent';
  available: boolean;
  unavailableReason?: string;
};

export type ChannelAnalyticsTopVideo = {
  videoId: string;
  title: string | null;
  url: string;
  views: number | null;
  watchMinutes: number | null;
  averageViewDuration: number | null;
  likes: number | null;
  comments: number | null;
};

export type ChannelAnalyticsSeriesPoint = {
  date: string;
  views: number | null;
  watchMinutes: number | null;
};

export type ChannelAnalyticsReport = {
  bound: true;
  projectSlug: string;
  channel: {
    id: string;
    title: string | null;
    handle: string | null;
    thumbnailUrl: string | null;
    uploadsPlaylistId: string | null;
    publicSubscribers: number | null;
    publicViews: number | null;
    publicVideoCount: number | null;
    hiddenSubscriberCount: boolean;
  };
  connection: {
    googleAccountEmail: string;
    status: string;
    connectedAt: string | null;
  };
  period: {
    start: string;
    end: string;
    timezone: string;
    label: string;
  };
  metrics: ChannelAnalyticsMetric[];
  impressions: ChannelAnalyticsMetric[];
  topVideos: ChannelAnalyticsTopVideo[];
  series: ChannelAnalyticsSeriesPoint[];
  fetchedAt: string;
  cached: boolean;
  cacheAgeSeconds: number | null;
  cacheTtlSeconds: number;
  reportingDelayDays: number;
  provenance: {
    dataApi: string[];
    analyticsApi: string[];
    quotaStrategy: string;
  };
  limitations: string[];
};

export type UnboundChannelAnalytics = {
  bound: false;
  projectSlug: string;
  reason: string;
};

export type ChannelAnalyticsResult = ChannelAnalyticsReport | UnboundChannelAnalytics;

function assertDate(value: string, label: string): string {
  if (!DATE_PATTERN.test(value)) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: `${label} must be YYYY-MM-DD.`,
      stage: 'analytics_validation',
    });
  }

  return value;
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

function metric(
  key: string,
  label: string,
  value: number | null,
  unit: ChannelAnalyticsMetric['unit'],
  unavailableReason: string
): ChannelAnalyticsMetric {
  return {
    key,
    label,
    value,
    unit,
    available: value !== null,
    ...(value === null ? { unavailableReason } : {}),
  };
}

export function analyticsMetricValue(
  totals: Record<string, number | null> | null,
  key: string
): number | null {
  const value = totals?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function mapTopVideos(
  rows: YouTubeAnalyticsRow[],
  titles: Map<string, string | null> = new Map()
): ChannelAnalyticsTopVideo[] {
  return rows
    .map((row) => {
      const videoId = row.dimensions.video;
      if (!videoId) return null;
      return {
        videoId,
        title: titles.get(videoId) ?? null,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        views: analyticsMetricValue(row.metrics, 'views'),
        watchMinutes: analyticsMetricValue(row.metrics, 'estimatedMinutesWatched'),
        averageViewDuration: analyticsMetricValue(row.metrics, 'averageViewDuration'),
        likes: analyticsMetricValue(row.metrics, 'likes'),
        comments: analyticsMetricValue(row.metrics, 'comments'),
      };
    })
    .filter((item): item is ChannelAnalyticsTopVideo => Boolean(item));
}

function buildChannelBlock(
  channel: YouTubeChannelRecord,
  resource: Awaited<ReturnType<typeof fetchChannelResource>> | null
): ChannelAnalyticsReport['channel'] {
  return {
    id: channel.channelId,
    title: resource?.title ?? channel.title,
    handle: resource?.handle ?? channel.handle,
    thumbnailUrl: channel.thumbnailUrl,
    uploadsPlaylistId: resource?.uploadsPlaylistId ?? channel.uploadsPlaylistId,
    publicSubscribers: resource?.subscribers ?? channel.subscriberCount,
    publicViews: resource?.views ?? channel.viewCount,
    publicVideoCount: resource?.videoCount ?? channel.videoCount,
    hiddenSubscriberCount:
      resource?.hiddenSubscriberCount ?? channel.hiddenSubscriberCount,
  };
}

function connectionBlock(connection: SafeOAuthConnection): ChannelAnalyticsReport['connection'] {
  return {
    googleAccountEmail: connection.googleAccountEmail,
    status: connection.status,
    connectedAt: connection.connectedAt,
  };
}

async function buildReport(input: {
  store: SupabaseClient;
  ownerId: string;
  projectSlug: string;
  start: string;
  end: string;
  now: Date;
}): Promise<ChannelAnalyticsReport | UnboundChannelAnalytics> {
  const resolved = await resolveProjectChannel(input.store, input.ownerId, input.projectSlug);

  if (!resolved) {
    return {
      bound: false,
      projectSlug: input.projectSlug,
      reason:
        'Проект ещё не привязан к YouTube-каналу. Подключите Google-аккаунт и выберите канал.',
    };
  }

  const { accessToken, channel } = await loadChannelAccessToken(input.store, {
    ownerId: input.ownerId,
    channelRecordId: resolved.channel.id,
  });

  const auth = { accessToken };
  const limitations: string[] = [];
  const dataApi: string[] = [];
  const analyticsApi: string[] = [];
  const unavailable =
    'YouTube Analytics не вернул метрику за этот период. Это не ноль — данные недоступны.';

  let resource: Awaited<ReturnType<typeof fetchChannelResource>> | null = null;
  try {
    resource = await fetchChannelResource(auth, channel.channelId);
    dataApi.push('youtube.v3 channels.list');
  } catch {
    limitations.push(
      'Публичные счётчики канала временно недоступны; приватная аналитика может работать.'
    );
  }

  let totals: Record<string, number | null> | null = null;
  try {
    const report = await runAnalyticsReport(auth, {
      channelId: channel.channelId,
      startDate: input.start,
      endDate: input.end,
      metrics: CHANNEL_METRICS,
    });
    totals = report.totals;
    analyticsApi.push('youtubeanalytics.v2 reports.query (channel totals)');
  } catch (error) {
    limitations.push(
      error instanceof YouTubeError
        ? error.message
        : 'YouTube Analytics не вернул итоговый отчёт за период.'
    );
  }

  if (totals && Object.values(totals).every((value) => value === null)) {
    limitations.push(
      'YouTube Analytics вернул пустой отчёт за этот период/фильтр; это не ноль.'
    );
  }

  const metrics: ChannelAnalyticsMetric[] = [
    metric('views', 'Просмотры за период', analyticsMetricValue(totals, 'views'), 'count', unavailable),
    metric(
      'estimatedMinutesWatched',
      'Минуты просмотра',
      analyticsMetricValue(totals, 'estimatedMinutesWatched'),
      'count',
      unavailable
    ),
    metric(
      'averageViewDuration',
      'Средняя длительность просмотра',
      analyticsMetricValue(totals, 'averageViewDuration'),
      'seconds',
      unavailable
    ),
    metric(
      'averageViewPercentage',
      'Средний процент просмотра',
      analyticsMetricValue(totals, 'averageViewPercentage'),
      'percent',
      unavailable
    ),
    metric(
      'subscribersGained',
      'Подписчики пришли',
      analyticsMetricValue(totals, 'subscribersGained'),
      'count',
      unavailable
    ),
    metric(
      'subscribersLost',
      'Подписчики ушли',
      analyticsMetricValue(totals, 'subscribersLost'),
      'count',
      unavailable
    ),
    metric('likes', 'Лайки', analyticsMetricValue(totals, 'likes'), 'count', unavailable),
    metric('comments', 'Комментарии', analyticsMetricValue(totals, 'comments'), 'count', unavailable),
    metric('shares', 'Репосты', analyticsMetricValue(totals, 'shares'), 'count', unavailable),
  ];

  const impressions: ChannelAnalyticsMetric[] = [];
  try {
    const report = await runAnalyticsReport(auth, {
      channelId: channel.channelId,
      startDate: input.start,
      endDate: input.end,
      metrics: ['videoThumbnailImpressions', 'videoThumbnailImpressionsClickRate'],
    });
    analyticsApi.push('youtubeanalytics.v2 reports.query (impressions/CTR)');
    impressions.push(
      metric(
        'videoThumbnailImpressions',
        'Показы превью',
        analyticsMetricValue(report.totals, 'videoThumbnailImpressions'),
        'count',
        unavailable
      ),
      metric(
        'videoThumbnailImpressionsClickRate',
        'CTR превью',
        analyticsMetricValue(report.totals, 'videoThumbnailImpressionsClickRate'),
        'percent',
        unavailable
      )
    );

    if (impressions.every((item) => !item.available)) {
      limitations.push(
        'Показы/CTR недоступны для этого канала или периода. Значения не подменены нулями.'
      );
    }
  } catch (error) {
    impressions.push(
      metric('videoThumbnailImpressions', 'Показы превью', null, 'count', unavailable),
      metric(
        'videoThumbnailImpressionsClickRate',
        'CTR превью',
        null,
        'percent',
        unavailable
      )
    );
    limitations.push(
      error instanceof YouTubeError
        ? `Показы/CTR недоступны: ${error.message}`
        : 'Показы/CTR недоступны для этого канала. Значения не подменены нулями.'
    );
  }

  let topVideos: ChannelAnalyticsTopVideo[] = [];
  try {
    const report = await runAnalyticsReport(auth, {
      channelId: channel.channelId,
      startDate: input.start,
      endDate: input.end,
      metrics: TOP_VIDEO_METRICS,
      dimensions: ['video'],
      sort: '-views',
      maxResults: 25,
    });
    analyticsApi.push('youtubeanalytics.v2 reports.query (top videos)');
    const ids = report.rows.map((row) => row.dimensions.video).filter(Boolean).slice(0, 50);
    const titles = new Map<string, string | null>();

    if (ids.length > 0) {
      try {
        const videos = await fetchVideoResources(auth, ids);
        dataApi.push('youtube.v3 videos.list (titles)');
        for (const video of videos) titles.set(video.id, video.title);
      } catch {
        limitations.push('Названия топ-видео временно недоступны; показаны video id.');
      }
    }

    topVideos = mapTopVideos(report.rows, titles);
  } catch (error) {
    limitations.push(
      error instanceof YouTubeError
        ? error.message
        : 'YouTube Analytics не вернул топ видео за период.'
    );
  }

  let series: ChannelAnalyticsSeriesPoint[] = [];
  try {
    const report = await runAnalyticsReport(auth, {
      channelId: channel.channelId,
      startDate: input.start,
      endDate: input.end,
      metrics: ['views', 'estimatedMinutesWatched'],
      dimensions: ['day'],
      sort: 'day',
      maxResults: 400,
    });
    analyticsApi.push('youtubeanalytics.v2 reports.query (daily series)');
    series = report.rows
      .filter((row) => Boolean(row.date))
      .map((row) => ({
        date: row.date as string,
        views: analyticsMetricValue(row.metrics, 'views'),
        watchMinutes: analyticsMetricValue(row.metrics, 'estimatedMinutesWatched'),
      }));
  } catch (error) {
    limitations.push(
      error instanceof YouTubeError
        ? error.message
        : 'Дневная динамика недоступна за этот период.'
    );
  }

  limitations.push(
    `YouTube Analytics задерживает финальные данные примерно на ${YOUTUBE_REPORTING_DELAY_DAYS} дн. Часовой пояс отчёта: ${getYouTubeTimezone()}.`
  );

  return {
    bound: true,
    projectSlug: input.projectSlug,
    channel: buildChannelBlock(channel, resource),
    connection: connectionBlock(resolved.connection),
    period: {
      start: input.start,
      end: input.end,
      timezone: getYouTubeTimezone(),
      label: `${input.start} — ${input.end}`,
    },
    metrics,
    impressions,
    topVideos,
    series,
    fetchedAt: input.now.toISOString(),
    cached: false,
    cacheAgeSeconds: null,
    cacheTtlSeconds: getYouTubeCacheTtlSeconds(),
    reportingDelayDays: YOUTUBE_REPORTING_DELAY_DAYS,
    provenance: {
      dataApi: Array.from(new Set(dataApi)),
      analyticsApi: Array.from(new Set(analyticsApi)),
      quotaStrategy:
        'Project binding checked first; one channel per report; max 4 Analytics queries; in-process TTL cache; fresh=1 bypasses cache.',
    },
    limitations: Array.from(new Set(limitations)).slice(0, 8),
  };
}

export async function getProjectChannelAnalytics(input: {
  store: SupabaseClient;
  ownerId: string;
  projectSlug: string;
  start: string;
  end: string;
  fresh?: boolean;
  now?: Date;
}): Promise<ChannelAnalyticsResult> {
  const start = assertDate(input.start, 'start');
  const end = assertDate(input.end, 'end');

  if (start > end) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'start must be on or before end.',
      stage: 'analytics_validation',
    });
  }

  if (daysBetween(start, end) > 366) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'The reporting period cannot exceed 366 days.',
      stage: 'analytics_validation',
    });
  }

  const key = JSON.stringify({ owner: input.ownerId, project: input.projectSlug, start, end });
  const now = input.now ?? new Date();

  if (!input.fresh) {
    const hit = cache.get(key);
    if (hit) {
      return {
        ...hit.value,
        cached: true,
        cacheAgeSeconds: hit.ageSeconds,
        fetchedAt: hit.value.fetchedAt,
      };
    }
  }

  const report = await buildReport({
    store: input.store,
    ownerId: input.ownerId,
    projectSlug: input.projectSlug,
    start,
    end,
    now,
  });

  if (report.bound) cache.set(key, report);
  return report;
}

export function clearChannelAnalyticsCache(): void {
  cache.clear();
}
