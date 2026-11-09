import { assertServerOnly } from '@/lib/serverOnly';
import { GA_MEASUREMENT_ID } from '@/lib/analytics/ga4';

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

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
] as const;

export const GA4_READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
export const GSC_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

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
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 365) : DEFAULT_BACKFILL_DAYS;
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

export function getGooglePropertyOverride(): string | null {
  return env('ANALYTICS_GA4_PROPERTY_ID') || null;
}

export function getSearchConsoleSiteOverride(): string | null {
  return env('ANALYTICS_GSC_SITE_URL') || null;
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

export function isAnalyticsSyncConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
      (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
  );
}

export function getSyncOwnerSecret(): string {
  return (
    env('ANALYTICS_SYNC_SECRET') ||
    env('CRON_SECRET') ||
    env('SUPABASE_SERVICE_ROLE_KEY')
  );
}
