import { assertServerOnly } from '@/lib/serverOnly';
import {
  GA4_READONLY_SCOPE,
  GSC_READONLY_SCOPE,
  WEBSITE_ANALYTICS_MEASUREMENT_ID,
  getGoogleOAuthConfig,
  getGooglePropertyOverride,
  getSearchConsoleSiteOverride,
  getSiteUrl,
} from '../config';
import { AnalyticsProviderError, fetchJson } from './http';
import { siteMatchesHost } from './searchConsole';
import type { Ga4PropertySummary } from './googleAnalytics';

assertServerOnly('lib/analytics/website/providers/oauth');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta';
const WEBMASTERS_API = 'https://www.googleapis.com/webmasters/v3';

export type GoogleTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
  tokenType: string | null;
};

type RawTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function toTokenSet(raw: RawTokenResponse): GoogleTokenSet {
  if (!raw.access_token) {
    throw new AnalyticsProviderError({
      provider: 'google_oauth',
      code: raw.error || 'no_access_token',
      message:
        raw.error === 'invalid_grant'
          ? 'Google authorization is no longer valid. Reconnect the source.'
          : raw.error_description || 'Google did not return an access token.',
    });
  }

  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? null,
    expiresAt:
      typeof raw.expires_in === 'number'
        ? new Date(Date.now() + raw.expires_in * 1000).toISOString()
        : null,
    scope: raw.scope ?? null,
    tokenType: raw.token_type ?? null,
  };
}

export function buildGoogleConsentUrl(input: {
  state: string;
  loginHint?: string | null;
}): string {
  const config = getGoogleOAuthConfig();

  if (!config.configured) {
    throw new Error(`Google OAuth is not configured: missing ${config.missing.join(', ')}.`);
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: [GA4_READONLY_SCOPE, GSC_READONLY_SCOPE].join(' '),
    state: input.state,
  });

  if (input.loginHint) params.set('login_hint', input.loginHint);

  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokenSet> {
  const config = getGoogleOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });

  const raw = await fetchJson<RawTokenResponse>(
    TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    { provider: 'google_oauth', retries: 1, label: 'exchange' }
  );

  return toTokenSet(raw);
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenSet> {
  const config = getGoogleOAuthConfig();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
  });

  const raw = await fetchJson<RawTokenResponse>(
    TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    { provider: 'google_oauth', retries: 1, label: 'refresh' }
  );

  return toTokenSet(raw);
}

export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch {
    // Revocation is best effort: the local token is deleted regardless.
  }
}

type AccountSummariesResponse = {
  accountSummaries?: Array<{
    account?: string;
    displayName?: string;
    propertySummaries?: Array<{
      property?: string;
      displayName?: string;
      propertyType?: string;
      parent?: string;
    }>;
  }>;
};

type DataStreamsResponse = {
  dataStreams?: Array<{
    name?: string;
    type?: string;
    webStreamData?: {
      measurementId?: string;
      defaultUri?: string;
    };
  }>;
};

export async function discoverGa4Properties(accessToken: string): Promise<Ga4PropertySummary[]> {
  const summaries = await fetchJson<AccountSummariesResponse>(
    `${ADMIN_API}/accountSummaries?pageSize=200`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    { provider: 'google_analytics', retries: 2, label: 'accountSummaries' }
  );

  const properties: Array<{
    propertyId: string;
    displayName: string;
    accountName: string | null;
  }> = [];

  for (const account of summaries.accountSummaries ?? []) {
    for (const property of account.propertySummaries ?? []) {
      const propertyId = (property.property || '').replace(/^properties\//, '');
      if (!propertyId) continue;

      properties.push({
        propertyId,
        displayName: property.displayName || propertyId,
        accountName: account.displayName || null,
      });
    }
  }

  const resolved: Ga4PropertySummary[] = [];

  for (const property of properties.slice(0, 60)) {
    try {
      const streams = await fetchJson<DataStreamsResponse>(
        `${ADMIN_API}/properties/${encodeURIComponent(property.propertyId)}/dataStreams?pageSize=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
        { provider: 'google_analytics', retries: 1, label: 'dataStreams' }
      );

      const measurementIds = (streams.dataStreams ?? [])
        .map((stream) => stream.webStreamData?.measurementId || '')
        .filter(Boolean);

      resolved.push({ ...property, measurementIds });
    } catch {
      resolved.push({ ...property, measurementIds: [] });
    }
  }

  return resolved;
}

export function chooseGa4Property(
  properties: Ga4PropertySummary[],
  options: { measurementId?: string; override?: string | null } = {}
): Ga4PropertySummary | null {
  const measurementId = options.measurementId || WEBSITE_ANALYTICS_MEASUREMENT_ID;
  const override = (options.override ?? getGooglePropertyOverride())?.replace(/^properties\//, '');

  if (override) {
    const match = properties.find((property) => property.propertyId === override);
    if (match) return match;

    return {
      propertyId: override,
      displayName: override,
      accountName: null,
      measurementIds: [],
    };
  }

  return properties.find((property) => property.measurementIds.includes(measurementId)) ?? null;
}

type SitesResponse = {
  siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
};

export type SearchConsoleSite = {
  siteUrl: string;
  permissionLevel: string;
};

export async function listSearchConsoleSites(
  accessToken: string
): Promise<SearchConsoleSite[]> {
  const raw = await fetchJson<SitesResponse>(
    `${WEBMASTERS_API}/sites`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    { provider: 'search_console', retries: 2, label: 'sites' }
  );

  return (raw.siteEntry ?? [])
    .filter((site) => Boolean(site.siteUrl))
    .map((site) => ({
      siteUrl: site.siteUrl as string,
      permissionLevel: site.permissionLevel || 'unknown',
    }));
}

export function chooseSearchConsoleSite(
  sites: SearchConsoleSite[],
  options: { siteUrl?: string | null } = {}
): SearchConsoleSite | null {
  const override = options.siteUrl ?? getSearchConsoleSiteOverride();
  if (override) {
    return sites.find((site) => site.siteUrl === override) ?? { siteUrl: override, permissionLevel: 'unknown' };
  }

  const host = new URL(getSiteUrl()).hostname;
  const matching = sites.filter((site) => siteMatchesHost(site.siteUrl, host));

  return (
    matching.find((site) => site.permissionLevel === 'siteOwner') ??
    matching.find((site) => site.permissionLevel === 'siteFullUser') ??
    matching[0] ??
    null
  );
}

export function redirectUriHint(): string {
  return getGoogleOAuthConfig().redirectUri;
}

/**
 * Checks the authorization endpoint before sending the owner to Google. A
 * missing redirect URI is a configuration error, not a reason to show the
 * owner a generic Google error page.
 */
export async function probeGoogleConsentUrl(
  consentUrl: string
): Promise<{ ok: boolean; reason: string | null }> {
  try {
    const response = await fetch(consentUrl, { redirect: 'manual' });
    const location = response.headers.get('location') || '';

    if (location.includes('redirect_uri_mismatch')) {
      return { ok: false, reason: 'redirect_uri_mismatch' };
    }

    if (location.includes('/signin/oauth/error') || location.includes('authError=')) {
      let decoded = '';

      try {
        const authError = new URL(location).searchParams.get('authError');
        if (authError) {
          decoded = Buffer.from(
            authError.replace(/-/g, '+').replace(/_/g, '/'),
            'base64'
          ).toString('utf8');
        }
      } catch {
        // Fall through to the generic configuration error.
      }

      if (decoded.includes('redirect_uri_mismatch')) {
        return { ok: false, reason: 'redirect_uri_mismatch' };
      }
      if (decoded.includes('invalid_client')) {
        return { ok: false, reason: 'invalid_client' };
      }

      return { ok: false, reason: 'oauth_configuration_error' };
    }

    return { ok: true, reason: null };
  } catch {
    return { ok: true, reason: null };
  }
}
