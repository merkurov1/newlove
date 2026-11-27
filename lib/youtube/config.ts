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
  getGoogleOAuthConfig,
  getSiteUrl,
  getYouTubeChannelsRedirectUri,
  getYouTubeManagementRedirectUri,
} from '@/lib/analytics/website/config';
import { analyticsEncryptionKeySource } from '@/lib/analytics/website/tokenCrypto';

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

/**
 * Safe, non-secret OAuth configuration snapshot for the owner diagnostics
 * panel.
 *
 * It exposes only booleans, environment variable *names* and redirect URIs
 * that must be registered in Google Cloud anyway. Client IDs, client secrets,
 * tokens and encryption keys never leave the server.
 */
export type YouTubeOAuthConfigDiagnostics = {
  googleOAuthConfigured: boolean;
  googleOAuthMissingEnvNames: string[];
  siteUrl: string;
  channelsRedirectUri: string;
  managementRedirectUri: string;
  usesDedicatedChannelsRedirectUri: boolean;
  channelsRedirectUriMatchesSite: boolean;
  managementRedirectUriMatchesSite: boolean;
  tokenEncryptionKeySource: 'dedicated' | 'derived';
  syncSecretConfigured: boolean;
  serviceRoleConfigured: boolean;
};

function uriMatchesSite(uri: string): boolean {
  try {
    return new URL(uri).origin === new URL(getSiteUrl()).origin;
  } catch {
    return false;
  }
}

export function getYouTubeOAuthConfigDiagnostics(): YouTubeOAuthConfigDiagnostics {
  const oauth = getGoogleOAuthConfig();
  const channelsRedirectUri = getYouTubeChannelsRedirectUri();
  const managementRedirectUri = getYouTubeManagementRedirectUri();

  return {
    googleOAuthConfigured: oauth.configured,
    googleOAuthMissingEnvNames: [...oauth.missing],
    siteUrl: getSiteUrl(),
    channelsRedirectUri,
    managementRedirectUri,
    usesDedicatedChannelsRedirectUri: Boolean(env('YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI')),
    channelsRedirectUriMatchesSite: uriMatchesSite(channelsRedirectUri),
    managementRedirectUriMatchesSite: uriMatchesSite(managementRedirectUri),
    tokenEncryptionKeySource: analyticsEncryptionKeySource(),
    // Only presence is reported; the value itself is never returned.
    syncSecretConfigured: Boolean(
      env('ANALYTICS_SYNC_SECRET') || env('CRON_SECRET') || env('SUPABASE_SERVICE_ROLE_KEY')
    ),
    serviceRoleConfigured: Boolean(env('SUPABASE_SERVICE_ROLE_KEY')),
  };
}

const YOUTUBE_FULL_SCOPE = 'https://www.googleapis.com/auth/youtube';
const YOUTUBE_ANALYTICS_MONETARY_READONLY_SCOPE =
  'https://www.googleapis.com/auth/yt-analytics-monetary.readonly';

/**
 * Google returns the broadest granted scope rather than every narrower alias.
 * A previous `youtube` or `youtube.force-ssl` grant therefore satisfies
 * read-only and upload operations even when `youtube.readonly` is not listed.
 */
const SCOPE_ALIASES: Record<string, readonly string[]> = {
  [YOUTUBE_READONLY_SCOPE]: [YOUTUBE_READONLY_SCOPE, YOUTUBE_FULL_SCOPE, YOUTUBE_FORCE_SSL_SCOPE],
  [YOUTUBE_UPLOAD_SCOPE]: [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_FULL_SCOPE, YOUTUBE_FORCE_SSL_SCOPE],
  [YOUTUBE_ANALYTICS_READONLY_SCOPE]: [
    YOUTUBE_ANALYTICS_READONLY_SCOPE,
    YOUTUBE_ANALYTICS_MONETARY_READONLY_SCOPE,
  ],
  [YOUTUBE_FORCE_SSL_SCOPE]: [YOUTUBE_FORCE_SSL_SCOPE, YOUTUBE_FULL_SCOPE],
};

export function youtubeScopeSatisfies(granted: readonly string[], required: string): boolean {
  const accepted = SCOPE_ALIASES[required] ?? [required];
  return accepted.some((scope) => granted.includes(scope));
}

export function missingYouTubeScopes(
  granted: readonly string[],
  required: readonly string[]
): string[] {
  return required.filter((scope) => !youtubeScopeSatisfies(granted, scope));
}

/** Capability-level scope requirements, kept beside the API operations. */
export const YOUTUBE_MANAGEMENT_SCOPE_BY_CAPABILITY = {
  channel: YOUTUBE_READONLY_SCOPE,
  videos: YOUTUBE_UPLOAD_SCOPE,
  thumbnail: YOUTUBE_UPLOAD_SCOPE,
  playlists: YOUTUBE_UPLOAD_SCOPE,
  comments: YOUTUBE_FORCE_SSL_SCOPE,
  captions: YOUTUBE_FORCE_SSL_SCOPE,
} as const;
