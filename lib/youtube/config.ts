import { assertServerOnly } from '@/lib/serverOnly';

import {
  YOUTUBE_ANALYTICS_READONLY_SCOPE,
  YOUTUBE_CHANNEL_CONNECTION_SCOPES,
  YOUTUBE_FORCE_SSL_SCOPE,
  YOUTUBE_MANAGEMENT_CONSENT_SCOPES,
  YOUTUBE_MANAGEMENT_SCOPES,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
  getAnalyticsTimezone,
  getYouTubeChannelsRedirectUri,
  getYouTubeManagementRedirectUri,
} from '@/lib/analytics/website/config';

assertServerOnly('lib/youtube/config');

/**
 * YouTube is one owner-level channel resource shared by Pierrot and UNFRAMED.
 * OAuth scopes are deliberately read-only. Monetary Analytics scopes are not
 * requested: the owner asked for reach and engagement, not revenue.
 */
export {
  YOUTUBE_ANALYTICS_READONLY_SCOPE,
  YOUTUBE_CHANNEL_CONNECTION_SCOPES,
  YOUTUBE_FORCE_SSL_SCOPE,
  YOUTUBE_MANAGEMENT_CONSENT_SCOPES,
  YOUTUBE_MANAGEMENT_SCOPES,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
};

export const YOUTUBE_REQUIRED_SCOPES = [
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_ANALYTICS_READONLY_SCOPE,
] as const;

export const YOUTUBE_DATA_API = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3';
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
  const raw = env('YOUTUBE_ANALYTICS_CACHE_TTL_SECONDS');
  if (!raw) return YOUTUBE_DEFAULT_CACHE_TTL_SECONDS;

  const value = Number(raw);
  return Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : YOUTUBE_DEFAULT_CACHE_TTL_SECONDS;
}

export function isYouTubeConfigured(): boolean {
  return Boolean(getYouTubeChannelId() || getYouTubeDataApiKey());
}

export { getYouTubeChannelsRedirectUri, getYouTubeManagementRedirectUri };

/** Capability-level scope requirements, kept beside the API operations. */
export const YOUTUBE_MANAGEMENT_SCOPE_BY_CAPABILITY = {
  channel: YOUTUBE_READONLY_SCOPE,
  videos: YOUTUBE_UPLOAD_SCOPE,
  thumbnail: YOUTUBE_UPLOAD_SCOPE,
  playlists: YOUTUBE_UPLOAD_SCOPE,
  comments: YOUTUBE_FORCE_SSL_SCOPE,
  captions: YOUTUBE_FORCE_SSL_SCOPE,
} as const;
