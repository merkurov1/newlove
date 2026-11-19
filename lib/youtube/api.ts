import {
  YOUTUBE_ANALYTICS_API,
  YOUTUBE_DATA_API,
  YOUTUBE_UPLOADS_MAX_PAGES,
  YOUTUBE_UPLOADS_PAGE_SIZE,
} from './config';
import { YouTubeError } from './types';

export type YouTubeAuth = {
  accessToken?: string | null;
  apiKey?: string | null;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type RequestOptions = {
  fetchImpl?: FetchLike;
  retries?: number;
  timeoutMs?: number;
  stage?: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

export const YOUTUBE_ANALYTICS_METRICS = {
  views: { unit: 'count' as const },
  estimatedMinutesWatched: { unit: 'count' as const },
  averageViewDuration: { unit: 'seconds' as const },
  averageViewPercentage: { unit: 'percent' as const },
  subscribersGained: { unit: 'count' as const },
  subscribersLost: { unit: 'count' as const },
  likes: { unit: 'count' as const },
  comments: { unit: 'count' as const },
  shares: { unit: 'count' as const },
  videoThumbnailImpressions: { unit: 'count' as const },
  videoThumbnailImpressionsClickRate: { unit: 'percent' as const },
} as const;

export type YouTubeAnalyticsMetric = keyof typeof YOUTUBE_ANALYTICS_METRICS;

const ALLOWED_DIMENSIONS = new Set([
  'day',
  'month',
  'video',
  'insightTrafficSourceType',
  'insightTrafficSourceDetail',
  'subscriberStatus',
  'country',
  'deviceType',
  'operatingSystem',
  'ageGroup',
  'gender',
]);

export type YouTubeAnalyticsQuery = {
  channelId: string;
  startDate: string;
  endDate: string;
  metrics: YouTubeAnalyticsMetric[];
  dimensions?: string[];
  filters?: Record<string, string>;
  sort?: string;
  maxResults?: number;
};

export type YouTubeAnalyticsRow = {
  date: string | null;
  dimensions: Record<string, string>;
  metrics: Record<string, number | null>;
};

export type ParsedAnalyticsReport = {
  headers: string[];
  rows: YouTubeAnalyticsRow[];
  totals: Record<string, number | null>;
};

function assertDate(value: string, label: string): string {
  if (!DATE_PATTERN.test(value)) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: `${label} must be YYYY-MM-DD.`,
      stage: 'validation',
    });
  }

  return value;
}

export function assertVideoId(value: string): string {
  const id = value.trim();

  if (!VIDEO_ID_PATTERN.test(id)) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'A YouTube video id must contain 6–20 URL-safe characters.',
      stage: 'validation',
    });
  }

  return id;
}

/**
 * Analytics API rejects incompatible dimension/metric pairs. Validate before
 * spending quota, and never send monetary metrics even if a caller asks for
 * them: the owner granted reach/engagement scopes only.
 */
export function validateAnalyticsQuery(query: YouTubeAnalyticsQuery): YouTubeAnalyticsQuery {
  const channelId = query.channelId.trim();

  if (!channelId) {
    throw new YouTubeError({
      code: 'not_configured',
      message: 'A YouTube channel id is required for Analytics reports.',
      stage: 'validation',
    });
  }

  const startDate = assertDate(query.startDate, 'startDate');
  const endDate = assertDate(query.endDate, 'endDate');

  if (startDate > endDate) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'startDate must be on or before endDate.',
      stage: 'validation',
    });
  }

  if (!Array.isArray(query.metrics) || query.metrics.length === 0) {
    throw new YouTubeError({
      code: 'invalid_request',
      message: 'At least one Analytics metric is required.',
      stage: 'validation',
    });
  }

  const metrics = Array.from(new Set(query.metrics));

  for (const metric of metrics) {
    if (!(metric in YOUTUBE_ANALYTICS_METRICS)) {
      throw new YouTubeError({
        code: 'unsupported_combination',
        message: `Unsupported YouTube Analytics metric: ${metric}.`,
        stage: 'validation',
      });
    }
  }

  const dimensions = Array.from(new Set(query.dimensions ?? []));

  for (const dimension of dimensions) {
    if (!ALLOWED_DIMENSIONS.has(dimension)) {
      throw new YouTubeError({
        code: 'unsupported_combination',
        message: `Unsupported YouTube Analytics dimension: ${dimension}.`,
        stage: 'validation',
      });
    }
  }

  if (dimensions.includes('day') && dimensions.includes('month')) {
    throw new YouTubeError({
      code: 'unsupported_combination',
      message: 'day and month cannot be requested in the same YouTube Analytics report.',
      stage: 'validation',
    });
  }

  if (dimensions.includes('day') && dimensions.includes('video')) {
    throw new YouTubeError({
      code: 'unsupported_combination',
      message: 'Per-day per-video reports are not supported by this bounded tool.',
      stage: 'validation',
    });
  }

  if (
    dimensions.includes('insightTrafficSourceType') &&
    metrics.some(
      (metric) => !['views', 'estimatedMinutesWatched', 'averageViewDuration'].includes(metric)
    )
  ) {
    throw new YouTubeError({
      code: 'unsupported_combination',
      message: 'Traffic-source reports support views and watch-time metrics only.',
      stage: 'validation',
    });
  }

  const filters = { ...(query.filters ?? {}) };

  if (filters.video) {
    filters.video = assertVideoId(filters.video);
  }

  if (filters.channel) {
    filters.channel = filters.channel.trim();
  }

  return {
    channelId,
    startDate,
    endDate,
    metrics,
    dimensions,
    filters,
    sort: query.sort,
    maxResults:
      typeof query.maxResults === 'number' && Number.isFinite(query.maxResults)
        ? Math.max(1, Math.min(Math.floor(query.maxResults), 200))
        : undefined,
  };
}

export function buildAnalyticsQuery(query: YouTubeAnalyticsQuery): URLSearchParams {
  const valid = validateAnalyticsQuery(query);
  const params = new URLSearchParams({
    ids: `channel==${valid.channelId}`,
    startDate: valid.startDate,
    endDate: valid.endDate,
    metrics: valid.metrics.join(','),
  });

  if (valid.dimensions?.length) params.set('dimensions', valid.dimensions.join(','));
  if (valid.sort) params.set('sort', valid.sort);
  if (valid.maxResults) params.set('maxResults', String(valid.maxResults));

  const filters = Object.entries(valid.filters ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}==${value}`);

  if (filters.length > 0) params.set('filters', filters.join(';'));

  return params;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseAnalyticsReport(raw: unknown): ParsedAnalyticsReport {
  const root =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  const rawHeaders = Array.isArray(root.columnHeaders) ? root.columnHeaders : [];
  const headers = rawHeaders
    .map((header) =>
      header && typeof header === 'object'
        ? String((header as Record<string, unknown>).name || '')
        : ''
    )
    .filter(Boolean);
  const rows = Array.isArray(root.rows) ? root.rows : [];
  const parsedRows: YouTubeAnalyticsRow[] = [];

  for (const rawRow of rows) {
    if (!Array.isArray(rawRow)) continue;

    const dimensions: Record<string, string> = {};
    const metrics: Record<string, number | null> = {};
    let date: string | null = null;

    headers.forEach((header, index) => {
      const value = rawRow[index];

      if (header === 'day' || header === 'month') {
        date = typeof value === 'string' ? value : date;
        dimensions[header] = typeof value === 'string' ? value : '';
      } else if (header in YOUTUBE_ANALYTICS_METRICS) {
        metrics[header] = toNumber(value);
      } else {
        dimensions[header] = value === null || value === undefined ? '' : String(value);
      }
    });

    parsedRows.push({ date, dimensions, metrics });
  }

  const totals: Record<string, number | null> = {};

  for (const header of headers) {
    if (!(header in YOUTUBE_ANALYTICS_METRICS)) continue;

    const values = parsedRows
      .map((row) => row.metrics[header])
      .filter((value): value is number => typeof value === 'number');

    totals[header] = values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
  }

  return { headers, rows: parsedRows, totals };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(body: string | null): Record<string, unknown> | null {
  if (!body) return null;

  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function classifyYouTubeFailure(
  status: number,
  body: string | null
): Pick<YouTubeError, 'code' | 'message' | 'retryable'> {
  const parsed = safeJson(body);
  const errorValue = parsed?.error;
  const errorObject =
    errorValue && typeof errorValue === 'object' && !Array.isArray(errorValue)
      ? (errorValue as Record<string, unknown>)
      : null;
  // YouTube Data API returns `error.errors[].reason`; Analytics API returns
  // `error.details[].reason`. Both must reach the quota/permission classifier.
  const details = Array.isArray(errorObject?.details) ? errorObject.details : [];
  const errors = Array.isArray(errorObject?.errors) ? errorObject.errors : [];
  const reasons = [...details, ...errors]
    .map((detail) =>
      detail && typeof detail === 'object'
        ? String((detail as Record<string, unknown>).reason || '').toLowerCase()
        : ''
    )
    .filter(Boolean);
  const message = (
    (errorObject && typeof errorObject.message === 'string' && errorObject.message) ||
    (typeof errorValue === 'string' && errorValue) ||
    ''
  ).toLowerCase();
  const probe = `${reasons.join(' ')} ${message}`;

  if (status === 401) {
    return {
      code: 'needs_reauthorization',
      message: 'YouTube authorization expired or was revoked. Reconnect the channel.',
      retryable: false,
    };
  }

  if (status === 403 && /quota|dailylimit|rateLimitExceeded/i.test(probe)) {
    return {
      code: /ratelimit|rateLimitExceeded/i.test(probe) ? 'rate_limited' : 'quota_exceeded',
      message: /ratelimit|rateLimitExceeded/i.test(probe)
        ? 'YouTube rate limit reached. Try again later or with a narrower date range.'
        : 'YouTube Analytics/Data API quota is exhausted. Try again after the quota resets.',
      retryable: /ratelimit|rateLimitExceeded/i.test(probe),
    };
  }

  if (status === 403) {
    if (
      /accessnotconfigured|service_disabled|api_not_enabled|has not been used|is disabled/i.test(
        probe
      )
    ) {
      return {
        code: 'api_not_enabled',
        message: 'The required YouTube API is not enabled for this Google Cloud project.',
        retryable: false,
      };
    }

    return {
      code: 'insufficient_permissions',
      message:
        'The Google account does not grant the required YouTube read-only access to this channel.',
      retryable: false,
    };
  }

  if (status === 404) {
    return {
      code: 'resource_not_found',
      message: 'The requested YouTube channel or video was not found or is not accessible.',
      retryable: false,
    };
  }

  if (status === 429) {
    return {
      code: 'rate_limited',
      message: 'YouTube rate limit reached. Try again later.',
      retryable: true,
    };
  }

  if (status === 400) {
    return {
      code: 'invalid_request',
      message: 'YouTube rejected the report parameters.',
      retryable: false,
    };
  }

  if (status >= 500) {
    return {
      code: 'upstream_error',
      message: 'YouTube returned a temporary server error.',
      retryable: true,
    };
  }

  return {
    code: 'request_failed',
    message: `YouTube returned HTTP ${status}.`,
    retryable: false,
  };
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  options: RequestOptions = {}
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retries = Math.max(0, options.retries ?? 1);
  let lastError: YouTubeError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);

    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (response.ok) {
        return (await response.json()) as T;
      }

      const body = await response.text().catch(() => null);
      const failure = classifyYouTubeFailure(response.status, body);

      lastError = new YouTubeError({
        ...failure,
        status: response.status,
        stage: options.stage ?? null,
      });

      if (!failure.retryable || attempt === retries) throw lastError;

      await sleep(Math.min(500 * 2 ** attempt, 5_000));
    } catch (error) {
      clearTimeout(timer);

      if (error instanceof YouTubeError) {
        if (!error.retryable || attempt === retries) throw error;
        await sleep(Math.min(500 * 2 ** attempt, 5_000));
        continue;
      }

      const aborted = error instanceof Error && error.name === 'AbortError';
      lastError = new YouTubeError({
        code: aborted ? 'timeout' : 'network_error',
        message: aborted
          ? 'YouTube API did not respond in time.'
          : 'YouTube API could not be reached.',
        retryable: true,
        stage: options.stage ?? null,
      });

      if (attempt === retries) throw lastError;
      await sleep(Math.min(500 * 2 ** attempt, 5_000));
    }
  }

  throw (
    lastError ??
    new YouTubeError({
      code: 'request_failed',
      message: 'The YouTube request failed.',
      stage: options.stage ?? null,
    })
  );
}

function authHeaders(auth: YouTubeAuth): HeadersInit {
  return auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {};
}

function withKey(url: URL, auth: YouTubeAuth): string {
  if (auth.apiKey) url.searchParams.set('key', auth.apiKey);
  return url.toString();
}

export async function runAnalyticsReport(
  auth: YouTubeAuth,
  query: YouTubeAnalyticsQuery,
  options: RequestOptions = {}
): Promise<ParsedAnalyticsReport> {
  if (!auth.accessToken) {
    throw new YouTubeError({
      code: 'needs_reauthorization',
      message: 'YouTube Analytics requires an owner OAuth connection.',
      stage: 'auth',
    });
  }

  const params = buildAnalyticsQuery(query);
  const url = `${YOUTUBE_ANALYTICS_API}/reports?${params.toString()}`;
  const raw = await requestJson<unknown>(
    url,
    { method: 'GET', headers: authHeaders(auth), cache: 'no-store' },
    { ...options, stage: options.stage ?? 'analytics.reports' }
  );

  return parseAnalyticsReport(raw);
}

export type YouTubeChannelResource = {
  id: string;
  title: string | null;
  handle: string | null;
  uploadsPlaylistId: string | null;
  subscribers: number | null;
  views: number | null;
  videoCount: number | null;
  hiddenSubscriberCount: boolean;
};

export async function fetchChannelResource(
  auth: YouTubeAuth,
  channelId: string | null,
  options: RequestOptions = {}
): Promise<YouTubeChannelResource> {
  const url = new URL(`${YOUTUBE_DATA_API}/channels`);
  url.searchParams.set('part', 'snippet,statistics,contentDetails');

  if (channelId) {
    url.searchParams.set('id', channelId);
  } else {
    url.searchParams.set('mine', 'true');
  }

  const raw = await requestJson<{
    items?: Array<{
      id?: string;
      snippet?: {
        title?: string;
        customUrl?: string;
      };
      statistics?: {
        viewCount?: string;
        subscriberCount?: string;
        hiddenSubscriberCount?: boolean;
        videoCount?: string;
      };
      contentDetails?: {
        relatedPlaylists?: { uploads?: string };
      };
    }>;
  }>(
    withKey(url, auth),
    { method: 'GET', headers: authHeaders(auth), cache: 'no-store' },
    { ...options, stage: options.stage ?? 'data.channels' }
  );

  const item = raw.items?.[0];

  if (!item?.id) {
    throw new YouTubeError({
      code: 'resource_not_found',
      message: 'The configured YouTube channel is not visible to this connection.',
      stage: 'data.channels',
    });
  }

  return {
    id: item.id,
    title: item.snippet?.title ?? null,
    handle: item.snippet?.customUrl ?? null,
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? null,
    subscribers: toNumber(item.statistics?.subscriberCount),
    views: toNumber(item.statistics?.viewCount),
    videoCount: toNumber(item.statistics?.videoCount),
    hiddenSubscriberCount: item.statistics?.hiddenSubscriberCount === true,
  };
}

export type YouTubeVideoResource = {
  id: string;
  title: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  isShort: boolean | null;
};

export function parseIsoDuration(value: string | null | undefined): number | null {
  if (!value) return null;

  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);

  if (!match) return null;

  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);

  return days * 86_400 + hours * 3_600 + minutes * 60 + seconds;
}

function mapVideoResource(item: {
  id?: string;
  snippet?: { title?: string; publishedAt?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
}): YouTubeVideoResource | null {
  if (!item.id) return null;

  const durationSeconds = parseIsoDuration(item.contentDetails?.duration);

  return {
    id: item.id,
    title: item.snippet?.title ?? null,
    publishedAt: item.snippet?.publishedAt ?? null,
    durationSeconds,
    views: toNumber(item.statistics?.viewCount),
    likes: toNumber(item.statistics?.likeCount),
    comments: toNumber(item.statistics?.commentCount),
    isShort: durationSeconds === null ? null : durationSeconds <= 60,
  };
}

export async function fetchVideoResources(
  auth: YouTubeAuth,
  videoIds: string[],
  options: RequestOptions = {}
): Promise<YouTubeVideoResource[]> {
  const ids = Array.from(new Set(videoIds.map(assertVideoId))).slice(0, 50);

  if (ids.length === 0) return [];

  const url = new URL(`${YOUTUBE_DATA_API}/videos`);
  url.searchParams.set('part', 'snippet,statistics,contentDetails');
  url.searchParams.set('id', ids.join(','));

  const raw = await requestJson<{
    items?: Array<{
      id?: string;
      snippet?: { title?: string; publishedAt?: string };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails?: { duration?: string };
    }>;
  }>(
    withKey(url, auth),
    { method: 'GET', headers: authHeaders(auth), cache: 'no-store' },
    { ...options, stage: options.stage ?? 'data.videos' }
  );

  return (raw.items ?? [])
    .map(mapVideoResource)
    .filter((item): item is YouTubeVideoResource => Boolean(item));
}

export type UploadPage = {
  videoIds: string[];
  nextPageToken: string | null;
};

/**
 * Bounded pagination: a large archive must not turn one question into an
 * unbounded crawl. The caller receives the cap and can report truncation.
 */
export async function collectUploadPages(
  fetchPage: (pageToken: string | null) => Promise<UploadPage>,
  maxPages = YOUTUBE_UPLOADS_MAX_PAGES
): Promise<{ videoIds: string[]; truncated: boolean }> {
  const ids: string[] = [];
  let pageToken: string | null = null;
  let pages = 0;

  while (pages < Math.max(1, maxPages)) {
    const page = await fetchPage(pageToken);
    ids.push(...page.videoIds);
    pages += 1;

    if (!page.nextPageToken) {
      return { videoIds: Array.from(new Set(ids)), truncated: false };
    }

    pageToken = page.nextPageToken;
  }

  return { videoIds: Array.from(new Set(ids)), truncated: true };
}

export async function fetchUploadVideoIds(
  auth: YouTubeAuth,
  uploadsPlaylistId: string,
  options: RequestOptions = {}
): Promise<{ videoIds: string[]; truncated: boolean }> {
  return collectUploadPages(async (pageToken) => {
    const url = new URL(`${YOUTUBE_DATA_API}/playlistItems`);
    url.searchParams.set('part', 'contentDetails');
    url.searchParams.set('playlistId', uploadsPlaylistId);
    url.searchParams.set('maxResults', String(YOUTUBE_UPLOADS_PAGE_SIZE));
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const raw = await requestJson<{
      items?: Array<{ contentDetails?: { videoId?: string } }>;
      nextPageToken?: string;
    }>(
      withKey(url, auth),
      { method: 'GET', headers: authHeaders(auth), cache: 'no-store' },
      { ...options, stage: options.stage ?? 'data.playlistItems' }
    );

    return {
      videoIds: (raw.items ?? [])
        .map((item) => item.contentDetails?.videoId)
        .filter((value): value is string => Boolean(value)),
      nextPageToken: raw.nextPageToken ?? null,
    };
  });
}
