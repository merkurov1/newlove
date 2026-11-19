import { assertServerOnly } from '@/lib/serverOnly';

import {
  YOUTUBE_ANALYTICS_READONLY_SCOPE,
  YOUTUBE_READONLY_SCOPE,
  getAnalyticsTimezone,
} from '@/lib/analytics/website/config';

assertServerOnly('lib/youtube/config');

/**
 * YouTube is one owner-level channel resource shared by Pierrot and UNFRAMED.
 * OAuth scopes are deliberately read-only. Monetary Analytics scopes are not
 * requested: the owner asked for reach and engagement, not revenue.
 */
export { YOUTUBE_ANALYTICS_READONLY_SCOPE, YOUTUBE_READONLY_SCOPE };

export const YOUTUBE_REQUIRED_SCOPES = [
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_ANALYTICS_READONLY_SCOPE,
] as const;

export const YOUTUBE_DATA_API = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2';

export const YOUTUBE_DEFAULT_CACHE_TTL_SECONDS = 300;
export const YOUTUBE_REPORTING_DELAY_DAYS = 2;
export const YOUTUBE_UPLOADS_PAGE_SIZE = 50;
export const YOUTUBE_UPLOADS_MAX_PAGES = 20;

/** Known public resources that belong to the shared channel. */
export const YOUTUBE_SHARED_PROJECTS = [
  { slug: 'pierrot', name: 'Pierrot' },
  { slug: 'unframed', name: 'UNFRAMED' },
] as const;

function env(name: string): string {
  return (process.env[name] || '').trim();
}

export function getYouTubeChannelId(): string | null {
  return env('YOUTUBE_ANALYTICS_CHANNEL_ID') || env('YOUTUBE_CHANNEL_ID') || null;
}

export function getYouTubeDataApiKey(): string | null {
  return env('YOUTUBE_API_KEY') || null;
}

export function getYouTubeTimezone(): string {
  return env('YOUTUBE_ANALYTICS_TIMEZONE') || getAnalyticsTimezone();
}

export function getYouTubeCacheTtlSeconds(): number {
  const value = Number(env('YOUTUBE_ANALYTICS_CACHE_TTL_SECONDS'));
  return Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : YOUTUBE_DEFAULT_CACHE_TTL_SECONDS;
}

export function isYouTubeConfigured(): boolean {
  return Boolean(getYouTubeChannelId() || getYouTubeDataApiKey());
}
