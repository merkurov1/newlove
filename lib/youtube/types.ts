export type YouTubeLanguage = 'ru' | 'en';

export type YouTubeMetricSource = 'youtube_data_api' | 'youtube_analytics';

export type YouTubeMetricUnit = 'count' | 'percent' | 'seconds';

export type YouTubeDataSourceState =
  | 'complete'
  | 'partial'
  | 'unavailable'
  | 'not_connected'
  | 'not_configured';

export type YouTubeErrorCode =
  | 'not_configured'
  | 'not_connected'
  | 'needs_reauthorization'
  | 'insufficient_permissions'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'api_not_enabled'
  | 'invalid_request'
  | 'resource_not_found'
  | 'network_error'
  | 'timeout'
  | 'upstream_error'
  | 'request_failed'
  | 'unsupported_combination';

export class YouTubeError extends Error {
  code: YouTubeErrorCode;
  status: number | null;
  retryable: boolean;
  requiredScopes: string[];
  stage: string | null;

  constructor(input: {
    code: YouTubeErrorCode;
    message: string;
    status?: number | null;
    retryable?: boolean;
    requiredScopes?: string[];
    stage?: string | null;
  }) {
    super(input.message);
    this.name = 'YouTubeError';
    this.code = input.code;
    this.status = input.status ?? null;
    this.retryable = input.retryable ?? false;
    this.requiredScopes = input.requiredScopes ?? [];
    this.stage = input.stage ?? null;
  }
}

export type YouTubeMetric = {
  key: string;
  label: string;
  value: number | null;
  previous: number | null;
  deltaPercent: number | null;
  unit: YouTubeMetricUnit;
  source: YouTubeMetricSource;
  /** Cumulative public counter (Data API) or period metric (Analytics API). */
  period: 'cumulative' | 'period';
  available: boolean;
  unavailableReason?: string;
};

export type YouTubeSeriesPoint = {
  date: string;
  views: number | null;
  watchMinutes: number | null;
  subscribersGained: number | null;
  subscribersLost: number | null;
};

export type YouTubeBreakdownRow = {
  key: string;
  label: string;
  value: number | null;
  previous: number | null;
  deltaPercent: number | null;
  share: number | null;
  unavailableReason?: string;
};

export type YouTubePublicVideo = {
  videoId: string;
  title: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  publicViews: number | null;
  publicLikes: number | null;
  publicComments: number | null;
  url: string;
  project: string | null;
  projectSlug: string | null;
  isShort: boolean | null;
};

export type YouTubePeriod = {
  key: string;
  label: string;
  timezone: string;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  previousLabel: string;
  comparison: boolean;
};

export type YouTubeProvenance = {
  fetchedAt: string;
  dataApi: string[];
  analyticsApi: string[];
  cached: boolean;
  cacheAgeSeconds: number | null;
  reportingDelayDays: number;
  notes: string[];
};

export type YouTubeChannelSummary = {
  id: string;
  title: string | null;
  handle: string | null;
  uploadsPlaylistId: string | null;
  publicSubscribers: number | null;
  publicViews: number | null;
  publicVideoCount: number | null;
  hiddenSubscriberCount: boolean;
};

export type YouTubeReportKind =
  | 'channel_overview'
  | 'video_overview'
  | 'time_series'
  | 'compare_videos'
  | 'compare_periods'
  | 'traffic_sources'
  | 'engagement';

export type YouTubeReport = {
  kind: YouTubeReportKind;
  language: YouTubeLanguage;
  channel: YouTubeChannelSummary | null;
  channelId: string | null;
  sharedProjects: Array<{ slug: string; name: string }>;
  period: YouTubePeriod;
  comparisonPeriod?: YouTubePeriod | null;
  metrics: YouTubeMetric[];
  series: YouTubeSeriesPoint[];
  breakdowns: YouTubeBreakdownRow[];
  videos: YouTubePublicVideo[];
  videoAnalytics: Array<{
    videoId: string;
    title: string | null;
    project: string | null;
    metrics: YouTubeMetric[];
  }>;
  dataState: YouTubeDataSourceState;
  analyticsAvailable: boolean;
  analyticsUnavailableReason: string | null;
  limitations: string[];
  provenance: YouTubeProvenance;
};
