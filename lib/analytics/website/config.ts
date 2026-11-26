import { assertServerOnly } from '@/lib/serverOnly';
import { GA_MEASUREMENT_ID } from '@/lib/analytics/ga4';
import { DEFAULT_BRAND_TERMS } from './searchInsights';

assertServerOnly('lib/analytics/website/config');

/**
 * Website intelligence configuration.
 *
 * Nothing in this module is exported with a NEXT_PUBLIC_ prefix. Empty values
 * are reported as "not configured" rather than treated as a working source.
 */

export const WEBSITE_ANALYTICS_MEASUREMENT_ID = GA_MEASUREMENT_ID;
export const DEFAULT_ANALYTICS_TIMEZONE = 'Europe/London';
export const DEFAULT_BACKFILL_DAYS = 90;
export const DEFAULT_INCREMENTAL_DAYS = 3;

/**
 * One incremental Google grant serves website intelligence and the shared
 * YouTube channel. Every scope is read-only; monetary YouTube Analytics scopes
 * are deliberately absent.
 */
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
] as const;

export const GA4_READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
export const GSC_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
export const YOUTUBE_ANALYTICS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/yt-analytics.readonly';

/**
 * Incremental, least-privilege scopes for YouTube channel management.
 *
 * `youtube.upload` covers videos, thumbnails, playlists and playlist items.
 * `youtube.force-ssl` is the narrowest Google scope that permits comment and
 * caption management. These scopes are only requested by the dedicated
 * management consent flow, never by the analytics connection.
 */
export const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
export const YOUTUBE_FORCE_SSL_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';

export const GOOGLE_IDENTITY_SCOPES = ['openid', 'email'] as const;

export const YOUTUBE_MANAGEMENT_SCOPES = [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_FORCE_SSL_SCOPE] as const;

/**
 * Scopes for the multi-channel connection: identity to show the Google
 * account, read-only YouTube + Analytics for reporting, and `youtube.upload`
 * for `videos.update` (metadata edits only). No upload flow is implemented in
 * this scope and `youtube.force-ssl` (comments/captions) is not requested.
 */
export const YOUTUBE_CHANNEL_CONNECTION_SCOPES = [
  ...GOOGLE_IDENTITY_SCOPES,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_ANALYTICS_READONLY_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
] as const;

/**
 * A management grant keeps `youtube.readonly` so the selected channel can be
 * verified without granting Analytics. It deliberately excludes GA4, Search
 * Console and yt-analytics.readonly: analytics consent stays incremental.
 */
export const YOUTUBE_MANAGEMENT_CONSENT_SCOPES = [
  ...GOOGLE_IDENTITY_SCOPES,
  YOUTUBE_READONLY_SCOPE,
  ...YOUTUBE_MANAGEMENT_SCOPES,
] as const;

function env(name: string): string {
  return (process.env[name] || '').trim();
}

export function getSiteUrl(): string {
  const value =
    env('NEXT_PUBLIC_SITE_URL') ||
    env('NEXT_PUBLIC_BASE_URL') ||
    env('NEXT_PUBLIC_APP_URL') ||
    'https://www.merkurov.love';

  return value.replace(/\/+$/, '');
}

export function getAnalyticsTimezone(): string {
  return env('ANALYTICS_TIMEZONE') || DEFAULT_ANALYTICS_TIMEZONE;
}

export function getBackfillDays(): number {
  const value = Number(env('ANALYTICS_BACKFILL_DAYS'));
  return Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), 365)
    : DEFAULT_BACKFILL_DAYS;
}

export function getIncrementalDays(): number {
  const value = Number(env('ANALYTICS_INCREMENTAL_DAYS'));
  return Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), 14)
    : DEFAULT_INCREMENTAL_DAYS;
}

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  configured: boolean;
  missing: string[];
};

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = env('GOOGLE_CLIENT_ID');
  const clientSecret = env('GOOGLE_CLIENT_SECRET');
  const redirectUri =
    env('ANALYTICS_GOOGLE_REDIRECT_URI') || `${getSiteUrl()}/api/auth/google-analytics/callback`;

  const missing: string[] = [];
  if (!clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET');

  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: missing.length === 0,
    missing,
  };
}

/**
 * The management consent uses its own callback so a write grant can never be
 * silently substituted for the analytics grant (and vice versa). The URI must
 * be registered in the same Google Cloud OAuth client.
 */
export function getYouTubeManagementRedirectUri(): string {
  return (
    env('YOUTUBE_MANAGEMENT_GOOGLE_REDIRECT_URI') ||
    `${getSiteUrl()}/api/auth/youtube-management/callback`
  );
}

/**
 * Dedicated callback for the multi-account / multi-channel connection flow.
 * It must be registered in the same Google Cloud OAuth client. Keeping it
 * separate means adding multi-channel support cannot change the redirect URI
 * used by already-working analytics or management grants.
 */
export function getYouTubeChannelsRedirectUri(): string {
  // By default the multi-channel flow reuses the already-registered
  // management callback. A dedicated URI can be opted into explicitly without
  // invalidating the existing analytics or management grants.
  return env('YOUTUBE_CHANNELS_GOOGLE_REDIRECT_URI') || getYouTubeManagementRedirectUri();
}

export function getGooglePropertyOverride(): string | null {
  return env('ANALYTICS_GA4_PROPERTY_ID') || null;
}

/**
 * Optional expected GA4 Account ID. When set, discovery verifies that the
 * property's `parent` matches it. Account IDs and Property IDs are different
 * resources and must never be substituted for one another.
 */
export function getGoogleAccountOverride(): string | null {
  return env('ANALYTICS_GA4_ACCOUNT_ID') || null;
}

export function getSearchConsoleSiteOverride(): string | null {
  return env('ANALYTICS_GSC_SITE_URL') || null;
}

/**
 * Optional comma-separated brand terms. Defaults stay in one place so the
 * dashboard and tests classify the same queries as brand/non-brand.
 */
export function getSearchBrandTerms(): string[] {
  const raw = env('ANALYTICS_GSC_BRAND_TERMS');
  const terms = (raw ? raw.split(',') : DEFAULT_BRAND_TERMS)
    .map((term) => term.trim())
    .filter(Boolean);

  return terms.length > 0 ? terms : DEFAULT_BRAND_TERMS;
}

/**
 * A stored grant with an explicit scope list must contain the required scope
 * before a sync is attempted. An empty legacy list is unknown, not a grant.
 */
export function missingRequiredScope(
  scopes: string[] | null | undefined,
  required: string
): boolean {
  if (!Array.isArray(scopes) || scopes.length === 0) return false;
  return !scopes.includes(required);
}

export type UmamiConfig = {
  baseUrl: string;
  apiKey: string;
  websiteId: string;
  configured: boolean;
  missing: string[];
};

export function getUmamiConfig(): UmamiConfig {
  const baseUrl = (env('ANALYTICS_UMAMI_API_URL') || env('UMAMI_API_URL')).replace(/\/+$/, '');
  const apiKey = env('ANALYTICS_UMAMI_API_KEY') || env('UMAMI_API_KEY');
  const websiteId = env('ANALYTICS_UMAMI_WEBSITE_ID') || env('UMAMI_WEBSITE_ID');

  const missing: string[] = [];
  if (!baseUrl) missing.push('ANALYTICS_UMAMI_API_URL');
  if (!apiKey) missing.push('ANALYTICS_UMAMI_API_KEY');
  if (!websiteId) missing.push('ANALYTICS_UMAMI_WEBSITE_ID');

  return { baseUrl, apiKey, websiteId, configured: missing.length === 0, missing };
}

export type BlueskyConfig = {
  identifier: string;
  password: string;
  configured: boolean;
  missing: string[];
};

export function getBlueskyConfig(): BlueskyConfig {
  const identifier = env('BLUESKY_IDENTIFIER');
  const password = env('BLUESKY_PASSWORD');
  const missing: string[] = [];
  if (!identifier) missing.push('BLUESKY_IDENTIFIER');
  if (!password) missing.push('BLUESKY_PASSWORD');

  return { identifier, password, configured: missing.length === 0, missing };
}

export function isAnalyticsSyncConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
      (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
  );
}

export function getSyncOwnerSecret(): string {
  return env('ANALYTICS_SYNC_SECRET') || env('CRON_SECRET') || env('SUPABASE_SERVICE_ROLE_KEY');
}
