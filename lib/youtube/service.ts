import { createHash } from 'node:crypto';

import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

import { saveSnapshot } from '@/lib/analytics/website/store';

import {
  fetchChannelResource,
  fetchVideoResources,
  runAnalyticsReport,
  type FetchLike,
  type YouTubeAnalyticsMetric,
  type YouTubeAnalyticsRow,
  type YouTubeChannelResource,
  type YouTubeVideoResource,
} from './api';
import { createReportCache } from './cache';
import {
  YOUTUBE_REPORTING_DELAY_DAYS,
  getYouTubeCacheTtlSeconds,
  getYouTubeChannelId,
  getYouTubeDataApiKey,
  getYouTubeTimezone,
} from './config';
import {
  loadYouTubeAccessToken,
  loadYouTubeConnectionState,
  type YouTubeConnectionState,
} from './connection';
import { getYouTubeProjectLink, getYouTubeSharedProjects } from './projects';
import {
  YouTubeError,
  type YouTubeBreakdownRow,
  type YouTubeChannelSummary,
  type YouTubeLanguage,
  type YouTubeMetric,
  type YouTubePeriod,
  type YouTubeProvenance,
  type YouTubePublicVideo,
  type YouTubeReport,
  type YouTubeReportKind,
  type YouTubeSeriesPoint,
} from './types';

assertServerOnly('lib/youtube/service');

export type YouTubeReportInput = {
  store: SupabaseClient;
  period: YouTubePeriod;
  language?: YouTubeLanguage;
  videoIds?: string[];
  fresh?: boolean;
  now?: Date;
  fetchImpl?: FetchLike;
};

type LoadedContext = {
  channelId: string | null;
  channel: YouTubeChannelResource | null;
  connection: YouTubeConnectionState;
  accessToken: string | null;
  analyticsError: string | null;
  channelError: string | null;
  channelErrorCode: string | null;
  dataApiSources: string[];
};

const cache = createReportCache<YouTubeReport>(getYouTubeCacheTtlSeconds());

function errorReason(error: unknown): { code: string; reason: string } {
  if (error instanceof YouTubeError) {
    const reason =
      error.code === 'not_connected'
        ? 'Общий YouTube-канал ещё не подключён. Публичные счётчики могут быть доступны, приватная аналитика — нет.'
        : error.code === 'needs_reauthorization'
          ? 'Google больше не принимает сохранённую авторизацию. Нужно переподключить общий канал.'
          : error.code === 'insufficient_permissions'
            ? 'В Google-разрешении нет нужных YouTube read-only scopes. Приватная аналитика недоступна.'
            : error.code === 'quota_exceeded'
              ? 'Квота YouTube API исчерпана. Данные не заменены нулями; повторите позже.'
              : error.code === 'rate_limited'
                ? 'YouTube временно ограничил частоту запросов. Повторите позже.'
                : error.code === 'api_not_enabled'
                  ? 'YouTube Analytics/Data API не включён в Google Cloud проекте.'
                  : error.message;

    return { code: error.code, reason };
  }

  return {
    code: 'unavailable',
    reason: 'YouTube API не вернул данные. Это не ноль и не доказательство отсутствия просмотров.',
  };
}

function emptyChannel(
  connection: YouTubeConnectionState,
  channelId: string | null
): YouTubeChannelSummary | null {
  if (!channelId && !connection.channelTitle) return null;

  return {
    id: channelId ?? '',
    title: connection.channelTitle,
    handle: null,
    uploadsPlaylistId: null,
    publicSubscribers: null,
    publicViews: null,
    publicVideoCount: null,
    hiddenSubscriberCount: false,
  };
}

async function loadContext(input: YouTubeReportInput): Promise<LoadedContext> {
  const connection = await loadYouTubeConnectionState(input.store).catch(() => ({
    configured: false,
    connected: false,
    status: 'not_connected',
    channelId: null,
    channelTitle: null,
    accountLabel: null,
    googleAccountEmail: null,
    scopes: [],
    missingScopes: [],
    managementAuthorized: false,
    managementScopes: [],
    missingManagementScopes: [],
    managementAuthorizedAt: null,
    projectSlugs: [],
    connectedAt: null,
    lastCheckedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  }));

  let accessToken: string | null = null;
  let analyticsError: string | null = null;
  const dataApiSources: string[] = [];

  if (connection.configured && connection.status !== 'disabled') {
    try {
      const token = await loadYouTubeAccessToken(input.store);
      accessToken = token.accessToken;
    } catch (error) {
      analyticsError = errorReason(error).reason;
    }
  } else if (!connection.configured) {
    analyticsError =
      'Общий YouTube-канал ещё не подключён. Приватные метрики Analytics недоступны без OAuth.';
  }

  const channelId = connection.channelId || getYouTubeChannelId();
  const auth = { accessToken, apiKey: getYouTubeDataApiKey() };
  const hasPublicAuth = Boolean(accessToken || auth.apiKey);
  let channel: YouTubeChannelResource | null = null;
  let channelError: string | null = null;
  let channelErrorCode: string | null = null;

  if ((channelId || accessToken) && hasPublicAuth) {
    try {
      channel = await fetchChannelResource(auth, channelId, { fetchImpl: input.fetchImpl });
      dataApiSources.push('youtube.v3 channels.list');
    } catch (error) {
      const mapped = errorReason(error);
      channelError = mapped.reason;
      channelErrorCode = mapped.code;
    }
  } else if (!channelId) {
    channelError =
      'Не задан YOUTUBE_CHANNEL_ID или YOUTUBE_ANALYTICS_CHANNEL_ID, а публичный YouTube Data API ключ отсутствует.';
    channelErrorCode = 'not_configured';
  } else if (!hasPublicAuth) {
    channelError =
      'Нет ни OAuth-подключения, ни YOUTUBE_API_KEY: публичные счётчики YouTube недоступны.';
    channelErrorCode = 'not_configured';
  }

  return {
    channelId: channel?.id ?? channelId,
    channel,
    connection,
    accessToken,
    analyticsError,
    channelError,
    channelErrorCode,
    dataApiSources,
  };
}

function deltaPercent(value: number | null, previous: number | null): number | null {
  if (value === null || previous === null || previous === 0) return null;
  return ((value - previous) / Math.abs(previous)) * 100;
}

function analyticsMetric(
  key: YouTubeAnalyticsMetric,
  label: string,
  totals: Record<string, number | null> | null,
  previousTotals: Record<string, number | null> | null,
  unavailableReason: string
): YouTubeMetric {
  const value = totals ? (totals[key] ?? null) : null;
  const previous = previousTotals ? (previousTotals[key] ?? null) : null;
  const unit =
    key === 'averageViewDuration'
      ? 'seconds'
      : key === 'averageViewPercentage' || key === 'videoThumbnailImpressionsClickRate'
        ? 'percent'
        : 'count';

  return {
    key,
    label,
    value,
    previous,
    deltaPercent: deltaPercent(value, previous),
    unit,
    source: 'youtube_analytics',
    period: 'period',
    available: value !== null,
    ...(value === null ? { unavailableReason } : {}),
  };
}

function channelAnalyticsMetrics(
  totals: Record<string, number | null> | null,
  previous: Record<string, number | null> | null,
  unavailableReason: string
): YouTubeMetric[] {
  return [
    analyticsMetric('views', 'Просмотры за период', totals, previous, unavailableReason),
    analyticsMetric(
      'estimatedMinutesWatched',
      'Минуты просмотра',
      totals,
      previous,
      unavailableReason
    ),
    analyticsMetric(
      'averageViewDuration',
      'Средняя длительность просмотра',
      totals,
      previous,
      unavailableReason
    ),
    analyticsMetric(
      'averageViewPercentage',
      'Средний процент просмотра',
      totals,
      previous,
      unavailableReason
    ),
    analyticsMetric('subscribersGained', 'Подписчики: пришли', totals, previous, unavailableReason),
    analyticsMetric('subscribersLost', 'Подписчики: ушли', totals, previous, unavailableReason),
    analyticsMetric('likes', 'Лайки за период', totals, previous, unavailableReason),
    analyticsMetric('comments', 'Комментарии за период', totals, previous, unavailableReason),
    analyticsMetric('shares', 'Репосты за период', totals, previous, unavailableReason),
  ];
}

function videoAnalyticsMetrics(
  totals: Record<string, number | null> | null,
  unavailableReason: string
): YouTubeMetric[] {
  return [
    analyticsMetric('views', 'Просмотры за период', totals, null, unavailableReason),
    analyticsMetric('estimatedMinutesWatched', 'Минуты просмотра', totals, null, unavailableReason),
    analyticsMetric(
      'averageViewDuration',
      'Средняя длительность просмотра',
      totals,
      null,
      unavailableReason
    ),
    analyticsMetric(
      'averageViewPercentage',
      'Средний процент просмотра',
      totals,
      null,
      unavailableReason
    ),
    analyticsMetric('likes', 'Лайки за период', totals, null, unavailableReason),
    analyticsMetric('comments', 'Комментарии за период', totals, null, unavailableReason),
    analyticsMetric('shares', 'Репосты за период', totals, null, unavailableReason),
  ];
}

function emptyTotalsReason(totals: Record<string, number | null>): string | null {
  const values = Object.values(totals);

  return values.length === 0 || values.every((value) => value === null)
    ? 'YouTube Analytics вернул пустой отчёт за этот период/фильтр; это не ноль.'
    : null;
}

const CHANNEL_TOTAL_METRICS: YouTubeAnalyticsMetric[] = [
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

/** Subscriber movement is channel-level; it is not requested with a video filter. */
const VIDEO_TOTAL_METRICS: YouTubeAnalyticsMetric[] = [
  'views',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'averageViewPercentage',
  'likes',
  'comments',
  'shares',
];

function publicMetric(input: {
  key: string;
  label: string;
  value: number | null;
  unavailableReason?: string;
}): YouTubeMetric {
  return {
    key: input.key,
    label: input.label,
    value: input.value,
    previous: null,
    deltaPercent: null,
    unit: 'count',
    source: 'youtube_data_api',
    period: 'cumulative',
    available: input.value !== null,
    ...(input.value === null
      ? {
          unavailableReason:
            input.unavailableReason || 'Публичный счётчик не вернул YouTube Data API; это не ноль.',
        }
      : {}),
  };
}

function channelSummary(context: LoadedContext): YouTubeChannelSummary | null {
  if (!context.channel) return emptyChannel(context.connection, context.channelId);

  return {
    id: context.channel.id,
    title: context.channel.title,
    handle: context.channel.handle,
    uploadsPlaylistId: context.channel.uploadsPlaylistId,
    publicSubscribers: context.channel.subscribers,
    publicViews: context.channel.views,
    publicVideoCount: context.channel.videoCount,
    hiddenSubscriberCount: context.channel.hiddenSubscriberCount,
  };
}

function publicMetrics(context: LoadedContext): YouTubeMetric[] {
  const channel = context.channel;
  const unavailable =
    context.channelError ||
    'Публичный счётчик не вернул YouTube Data API; это не ноль и не отсутствие аудитории.';

  return [
    publicMetric({
      key: 'public_subscribers',
      label: 'Подписчики канала (публично)',
      value: channel?.subscribers ?? null,
      unavailableReason: channel?.hiddenSubscriberCount
        ? 'Канал скрывает публичное число подписчиков.'
        : unavailable,
    }),
    publicMetric({
      key: 'public_views',
      label: 'Просмотры канала всего (публично)',
      value: channel?.views ?? null,
      unavailableReason: unavailable,
    }),
    publicMetric({
      key: 'public_videos',
      label: 'Видео на канале (публично)',
      value: channel?.videoCount ?? null,
      unavailableReason: unavailable,
    }),
  ];
}

function buildVideo(resource: YouTubeVideoResource | null, videoId: string): YouTubePublicVideo {
  const link = getYouTubeProjectLink(videoId);

  return {
    videoId,
    title: resource?.title ?? null,
    publishedAt: resource?.publishedAt ?? null,
    durationSeconds: resource?.durationSeconds ?? null,
    publicViews: resource?.views ?? null,
    publicLikes: resource?.likes ?? null,
    publicComments: resource?.comments ?? null,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    project: link?.episodeLabel
      ? `${link.projectName} · ${link.episodeLabel}`
      : (link?.projectName ?? null),
    projectSlug: link?.projectSlug ?? null,
    isShort: resource?.isShort ?? null,
  };
}

async function loadVideoResources(
  context: LoadedContext,
  videoIds: string[],
  fetchImpl?: FetchLike
): Promise<YouTubePublicVideo[]> {
  if (videoIds.length === 0) return [];

  const auth = {
    accessToken: context.accessToken,
    apiKey: getYouTubeDataApiKey(),
  };

  if (!auth.accessToken && !auth.apiKey) return videoIds.map((id) => buildVideo(null, id));

  try {
    const resources = await fetchVideoResources(auth, videoIds, { fetchImpl });
    const byId = new Map(resources.map((resource) => [resource.id, resource]));
    context.dataApiSources.push('youtube.v3 videos.list');
    return videoIds.map((id) => buildVideo(byId.get(id) ?? null, id));
  } catch {
    return videoIds.map((id) => buildVideo(null, id));
  }
}

function buildProvenance(
  context: LoadedContext,
  fetchedAt: string,
  analyticsQueries: string[],
  notes: string[],
  cacheAgeSeconds: number | null = null
): YouTubeProvenance {
  return {
    fetchedAt,
    dataApi: Array.from(new Set(context.dataApiSources)),
    analyticsApi: Array.from(new Set(analyticsQueries)),
    cached: cacheAgeSeconds !== null,
    cacheAgeSeconds,
    reportingDelayDays: YOUTUBE_REPORTING_DELAY_DAYS,
    notes,
  };
}

function baseLimitations(context: LoadedContext): string[] {
  const limitations: string[] = [];

  if (!context.accessToken) {
    limitations.push(
      context.analyticsError ||
        'YouTube Analytics недоступен: приватные метрики не подставлены нулями.'
    );
  }

  if (context.channelError) limitations.push(context.channelError);

  limitations.push(
    `YouTube Analytics обычно задерживает финальные данные на ${YOUTUBE_REPORTING_DELAY_DAYS} дн. Самая свежая дата может быть неполной.`
  );

  return limitations;
}

function analyticsQueriesFor(kind: YouTubeReportKind): string[] {
  if (kind === 'time_series') return ['youtubeanalytics.v2 reports.query (day)'];
  if (kind === 'traffic_sources')
    return ['youtubeanalytics.v2 reports.query (insightTrafficSourceType)'];
  if (kind === 'video_overview') return ['youtubeanalytics.v2 reports.query (video filter)'];
  return ['youtubeanalytics.v2 reports.query (channel totals)'];
}

async function runTotals(
  context: LoadedContext,
  input: YouTubeReportInput,
  startDate: string,
  endDate: string,
  filters?: Record<string, string>,
  metrics: YouTubeAnalyticsMetric[] = CHANNEL_TOTAL_METRICS
): Promise<Record<string, number | null>> {
  if (!context.accessToken || !context.channelId) {
    throw new YouTubeError({
      code: context.connection.configured ? 'needs_reauthorization' : 'not_connected',
      message: context.analyticsError || 'YouTube Analytics is unavailable.',
      stage: 'analytics',
    });
  }

  const report = await runAnalyticsReport(
    { accessToken: context.accessToken },
    {
      channelId: context.channelId,
      startDate,
      endDate,
      metrics,
      filters,
    },
    { fetchImpl: input.fetchImpl }
  );

  return report.totals;
}

function dateRowsToSeries(rows: YouTubeAnalyticsRow[]): YouTubeSeriesPoint[] {
  return rows
    .filter((row) => Boolean(row.date))
    .map((row) => ({
      date: row.date as string,
      views: row.metrics.views ?? null,
      watchMinutes: row.metrics.estimatedMinutesWatched ?? null,
      subscribersGained: row.metrics.subscribersGained ?? null,
      subscribersLost: row.metrics.subscribersLost ?? null,
    }));
}

async function persistSnapshot(store: SupabaseClient, report: YouTubeReport): Promise<void> {
  try {
    const payload = JSON.stringify(report);
    const checksum = createHash('sha256').update(payload).digest('hex').slice(0, 32);

    await saveSnapshot(store, {
      provider: 'youtube',
      reportType: report.kind,
      periodStart: report.period.start,
      periodEnd: report.period.end,
      checksum,
      payload: report,
    });
  } catch {
    // A missing additive migration must not break a chat answer.
  }
}

function cacheKey(kind: YouTubeReportKind, input: YouTubeReportInput): string {
  return JSON.stringify({
    kind,
    channelPeriod: [input.period.start, input.period.end],
    videoIds: (input.videoIds ?? []).slice().sort(),
    language: input.language ?? 'ru',
  });
}

function withCacheHit(report: YouTubeReport, hit: { ageSeconds: number; fetchedAt: string }) {
  return {
    ...report,
    provenance: {
      ...report.provenance,
      cached: true,
      cacheAgeSeconds: hit.ageSeconds,
      fetchedAt: hit.fetchedAt,
    },
  };
}

async function buildBaseReport(
  kind: YouTubeReportKind,
  input: YouTubeReportInput
): Promise<YouTubeReport> {
  const language = input.language ?? 'ru';
  const context = await loadContext(input);
  const channel = channelSummary(context);
  const fetchedAt = (input.now ?? new Date()).toISOString();
  const metrics: YouTubeMetric[] = [];
  const series: YouTubeSeriesPoint[] = [];
  const breakdowns: YouTubeBreakdownRow[] = [];
  const videos: YouTubePublicVideo[] = [];
  const videoAnalytics: YouTubeReport['videoAnalytics'] = [];
  const limitations = baseLimitations(context);
  let analyticsAvailable = Boolean(context.accessToken && context.channelId);
  let analyticsUnavailableReason = analyticsAvailable ? null : context.analyticsError;
  const queries = analyticsQueriesFor(kind);

  const unavailable =
    analyticsUnavailableReason || 'YouTube Analytics недоступен для этого отчёта.';

  if (
    kind === 'channel_overview' ||
    kind === 'time_series' ||
    kind === 'engagement' ||
    kind === 'traffic_sources'
  ) {
    metrics.push(...publicMetrics(context));

    try {
      const totals = await runTotals(context, input, input.period.start, input.period.end);
      const totalsReason = emptyTotalsReason(totals);
      analyticsAvailable = true;
      analyticsUnavailableReason = totalsReason;
      if (totalsReason) limitations.push(totalsReason);
      metrics.push(...channelAnalyticsMetrics(totals, null, totalsReason || unavailable));
    } catch (error) {
      analyticsAvailable = false;
      analyticsUnavailableReason = context.analyticsError || errorReason(error).reason;
      limitations.push(analyticsUnavailableReason);
      metrics.push(...channelAnalyticsMetrics(null, null, analyticsUnavailableReason));
    }

    if (kind === 'time_series' && context.accessToken && context.channelId) {
      try {
        const report = await runAnalyticsReport(
          { accessToken: context.accessToken },
          {
            channelId: context.channelId,
            startDate: input.period.start,
            endDate: input.period.end,
            metrics: ['views', 'estimatedMinutesWatched', 'subscribersGained', 'subscribersLost'],
            dimensions: ['day'],
            sort: 'day',
            maxResults: 200,
          },
          { fetchImpl: input.fetchImpl }
        );

        series.push(...dateRowsToSeries(report.rows));
        analyticsAvailable = true;
      } catch (error) {
        analyticsAvailable = false;
        analyticsUnavailableReason = context.analyticsError || errorReason(error).reason;
        limitations.push(analyticsUnavailableReason);
      }
    }

    if (kind === 'traffic_sources' && context.accessToken && context.channelId) {
      try {
        const report = await runAnalyticsReport(
          { accessToken: context.accessToken },
          {
            channelId: context.channelId,
            startDate: input.period.start,
            endDate: input.period.end,
            metrics: ['views', 'estimatedMinutesWatched'],
            dimensions: ['insightTrafficSourceType'],
            sort: '-views',
            maxResults: 25,
          },
          { fetchImpl: input.fetchImpl }
        );

        const totalViews = report.rows.reduce((sum, row) => sum + (row.metrics.views ?? 0), 0);

        breakdowns.push(
          ...report.rows.map((row) => {
            const value = row.metrics.views ?? null;

            return {
              key: row.dimensions.insightTrafficSourceType || 'unknown',
              label: translateTrafficSource(row.dimensions.insightTrafficSourceType || 'unknown'),
              value,
              previous: null,
              deltaPercent: null,
              share: value === null || totalViews === 0 ? null : (value / totalViews) * 100,
              ...(value === null
                ? {
                    unavailableReason: 'YouTube Analytics не вернул просмотры для этого источника.',
                  }
                : {}),
            };
          })
        );
      } catch (error) {
        limitations.push(errorReason(error).reason);
      }
    }
  }

  if (kind === 'video_overview' || kind === 'compare_videos') {
    const videoIds = input.videoIds ?? [];

    if (videoIds.length === 0) {
      limitations.push('Не указан ни один YouTube video id.');
    }

    videos.push(...(await loadVideoResources(context, videoIds, input.fetchImpl)));

    for (const video of videos) {
      const publicReason = 'Публичный счётчик видео не вернул YouTube Data API; это не ноль.';

      const videoMetrics: YouTubeMetric[] = [
        publicMetric({
          key: `${video.videoId}:public_views`,
          label: 'Просмотры видео всего (публично)',
          value: video.publicViews,
          unavailableReason: publicReason,
        }),
        publicMetric({
          key: `${video.videoId}:public_likes`,
          label: 'Лайки видео всего (публично)',
          value: video.publicLikes,
          unavailableReason: publicReason,
        }),
        publicMetric({
          key: `${video.videoId}:public_comments`,
          label: 'Комментарии видео всего (публично)',
          value: video.publicComments,
          unavailableReason: publicReason,
        }),
      ];

      if (context.accessToken && context.channelId) {
        try {
          const totals = await runTotals(
            context,
            input,
            input.period.start,
            input.period.end,
            { video: video.videoId },
            VIDEO_TOTAL_METRICS
          );

          const totalsReason = emptyTotalsReason(totals);
          analyticsAvailable = true;
          analyticsUnavailableReason = totalsReason;
          if (totalsReason) limitations.push(totalsReason);
          videoMetrics.push(...videoAnalyticsMetrics(totals, totalsReason || unavailable));
        } catch (error) {
          analyticsAvailable = false;
          analyticsUnavailableReason = context.analyticsError || errorReason(error).reason;
          limitations.push(analyticsUnavailableReason);
          videoMetrics.push(...videoAnalyticsMetrics(null, analyticsUnavailableReason));
        }
      } else {
        videoMetrics.push(...videoAnalyticsMetrics(null, unavailable));
      }

      videoAnalytics.push({
        videoId: video.videoId,
        title: video.title,
        project: video.project,
        metrics: videoMetrics,
      });
    }
  }

  if (kind === 'compare_periods') {
    metrics.push(...publicMetrics(context));

    try {
      const current = await runTotals(context, input, input.period.start, input.period.end);
      let previous: Record<string, number | null> | null = null;

      try {
        previous = await runTotals(
          context,
          input,
          input.period.previousStart,
          input.period.previousEnd
        );
      } catch (error) {
        limitations.push(`Сравнение с предыдущим периодом неполное: ${errorReason(error).reason}`);
      }

      const totalsReason = emptyTotalsReason(current);
      analyticsAvailable = true;
      analyticsUnavailableReason = totalsReason;
      if (totalsReason) limitations.push(totalsReason);
      metrics.push(...channelAnalyticsMetrics(current, previous, totalsReason || unavailable));
    } catch (error) {
      analyticsAvailable = false;
      analyticsUnavailableReason = context.analyticsError || errorReason(error).reason;
      limitations.push(analyticsUnavailableReason);
      metrics.push(...channelAnalyticsMetrics(null, null, analyticsUnavailableReason));
    }
  }

  const analyticsHasData =
    metrics.some((metric) => metric.source === 'youtube_analytics' && metric.available) ||
    videoAnalytics.some((video) =>
      video.metrics.some((metric) => metric.source === 'youtube_analytics' && metric.available)
    );
  const dataState = !context.channelId
    ? 'not_configured'
    : analyticsAvailable && channel && analyticsHasData
      ? 'complete'
      : channel || metrics.some((metric) => metric.available)
        ? 'partial'
        : 'unavailable';

  const report: YouTubeReport = {
    kind,
    language,
    channel,
    channelId: context.channelId,
    sharedProjects: getYouTubeSharedProjects(),
    period: input.period,
    comparisonPeriod:
      kind === 'compare_periods'
        ? {
            ...input.period,
            key: 'previous',
            label: input.period.previousLabel,
            start: input.period.previousStart,
            end: input.period.previousEnd,
            comparison: false,
          }
        : null,
    metrics,
    series,
    breakdowns,
    videos,
    videoAnalytics,
    dataState,
    analyticsAvailable,
    analyticsUnavailableReason,
    limitations: Array.from(new Set(limitations)).slice(0, 8),
    provenance: buildProvenance(context, fetchedAt, queries, limitations),
  };

  return report;
}

function translateTrafficSource(value: string): string {
  const labels: Record<string, string> = {
    YT_SEARCH: 'YouTube поиск',
    SUBSCRIBER: 'Подписчики / лента',
    RELATED_VIDEO: 'Похожие видео',
    PLAYLIST: 'Плейлисты',
    EXTERNAL: 'Внешние сайты',
    NO_LINK_OTHER: 'Прямые ссылки / другое',
    YT_CHANNEL: 'Страница канала',
    YT_OTHER: 'Другие места YouTube',
    SHORTS: 'Shorts feed',
  };

  return labels[value] || value;
}

export async function buildYouTubeReport(
  kind: YouTubeReportKind,
  input: YouTubeReportInput
): Promise<YouTubeReport> {
  const key = cacheKey(kind, input);

  if (!input.fresh) {
    const hit = cache.get(key);
    if (hit) return withCacheHit(hit.value, hit);
  }

  const report = await buildBaseReport(kind, input);
  cache.set(key, report);
  await persistSnapshot(input.store, report);

  return report;
}

export function youtubeTimezone(): string {
  return getYouTubeTimezone();
}
