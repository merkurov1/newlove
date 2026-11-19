import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

import { buildYouTubeReport, type YouTubeReportInput } from './service';
import type { YouTubeQuestionScope } from './question';
import type { YouTubeLanguage, YouTubePeriod, YouTubeReport, YouTubeReportKind } from './types';

assertServerOnly('lib/youtube/tools');

export const YOUTUBE_ANALYTICS_TOOL_NAMES = [
  'get_youtube_channel_overview',
  'get_youtube_video_overview',
  'get_youtube_time_series',
  'compare_youtube_videos',
  'compare_youtube_periods',
  'get_youtube_traffic_sources',
  'get_youtube_engagement',
] as const;

export type YouTubeAnalyticsToolName = (typeof YOUTUBE_ANALYTICS_TOOL_NAMES)[number];

const TOOL_TO_KIND: Record<YouTubeAnalyticsToolName, YouTubeReportKind> = {
  get_youtube_channel_overview: 'channel_overview',
  get_youtube_video_overview: 'video_overview',
  get_youtube_time_series: 'time_series',
  compare_youtube_videos: 'compare_videos',
  compare_youtube_periods: 'compare_periods',
  get_youtube_traffic_sources: 'traffic_sources',
  get_youtube_engagement: 'engagement',
};

const SCOPE_TO_TOOL: Record<YouTubeQuestionScope, YouTubeAnalyticsToolName> = {
  channel_overview: 'get_youtube_channel_overview',
  video_overview: 'get_youtube_video_overview',
  time_series: 'get_youtube_time_series',
  compare_videos: 'compare_youtube_videos',
  compare_periods: 'compare_youtube_periods',
  traffic_sources: 'get_youtube_traffic_sources',
  engagement: 'get_youtube_engagement',
};

export function youtubeToolForScope(scope: YouTubeQuestionScope): YouTubeAnalyticsToolName {
  return SCOPE_TO_TOOL[scope];
}

export type YouTubeToolOptions = {
  store: SupabaseClient;
  period: YouTubePeriod;
  language?: YouTubeLanguage;
  videoIds?: string[];
  fresh?: boolean;
  now?: Date;
};

function run(name: YouTubeAnalyticsToolName, options: YouTubeToolOptions): Promise<YouTubeReport> {
  const input: YouTubeReportInput = {
    store: options.store,
    period: options.period,
    language: options.language,
    videoIds: options.videoIds,
    fresh: options.fresh,
    now: options.now,
  };

  return buildYouTubeReport(TOOL_TO_KIND[name], input);
}

export function get_youtube_channel_overview(options: YouTubeToolOptions) {
  return run('get_youtube_channel_overview', options);
}

export function get_youtube_video_overview(options: YouTubeToolOptions) {
  return run('get_youtube_video_overview', options);
}

export function get_youtube_time_series(options: YouTubeToolOptions) {
  return run('get_youtube_time_series', options);
}

export function compare_youtube_videos(options: YouTubeToolOptions) {
  return run('compare_youtube_videos', options);
}

export function compare_youtube_periods(options: YouTubeToolOptions) {
  return run('compare_youtube_periods', options);
}

export function get_youtube_traffic_sources(options: YouTubeToolOptions) {
  return run('get_youtube_traffic_sources', options);
}

export function get_youtube_engagement(options: YouTubeToolOptions) {
  return run('get_youtube_engagement', options);
}

export function runYouTubeAnalyticsTool(
  name: YouTubeAnalyticsToolName,
  options: YouTubeToolOptions
): Promise<YouTubeReport> {
  return run(name, options);
}
