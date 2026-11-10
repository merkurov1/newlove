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
import {
  AnalyticsProviderError,
  diagnosticFromError,
  fetchJson,
  type ProviderErrorDiagnostic,
} from './http';
import { normalizeSiteUrl, siteMatchesHost } from './searchConsole';
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

export function buildGoogleConsentUrl(input: { state: string; loginHint?: string | null }): string {
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
  nextPageToken?: string;
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
  nextPageToken?: string;
};

export type Ga4DiscoveryResult = {
  properties: Ga4PropertySummary[];
  warnings: ProviderErrorDiagnostic[];
  accountCount: number;
};

async function readAllAccountSummaries(accessToken: string): Promise<AccountSummariesResponse[]> {
  const pages: AccountSummariesResponse[] = [];
  let pageToken: string | null = null;
  let pageCount = 0;

  do {
    const query = new URLSearchParams({ pageSize: '200' });
    if (pageToken) query.set('pageToken', pageToken);

    const page = await fetchJson<AccountSummariesResponse>(
      `${ADMIN_API}/accountSummaries?${query.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      {
        provider: 'google_analytics',
        retries: 2,
        label: 'accountSummaries',
        stage: 'accountSummaries',
        scope: GA4_READONLY_SCOPE,
      }
    );

    pages.push(page);
    pageToken = page.nextPageToken || null;
    pageCount += 1;

    // Defensive guard against a malformed upstream token loop. Normal
    // accounts have one page; large agencies may have a handful.
    if (pageCount >= 100) break;
  } while (pageToken);

  return pages;
}

async function readAllDataStreams(
  accessToken: string,
  propertyId: string
): Promise<{ measurementIds: string[]; warnings: ProviderErrorDiagnostic[] }> {
  const measurementIds: string[] = [];
  const warnings: ProviderErrorDiagnostic[] = [];
  let pageToken: string | null = null;
  let pageCount = 0;

  do {
    const query = new URLSearchParams({ pageSize: '200' });
    if (pageToken) query.set('pageToken', pageToken);

    try {
      const page = await fetchJson<DataStreamsResponse>(
        `${ADMIN_API}/properties/${encodeURIComponent(propertyId)}/dataStreams?${query.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
        {
          provider: 'google_analytics',
          retries: 1,
          label: 'dataStreams',
          stage: `dataStreams:${propertyId}`,
          scope: GA4_READONLY_SCOPE,
        }
      );

      for (const stream of page.dataStreams ?? []) {
        // A property can also have iOS/Android streams. Only a web stream's
        // measurement id can match the browser gtag id.
        const measurementId =
          stream.type === 'WEB_DATA_STREAM' ? stream.webStreamData?.measurementId || '' : '';

        if (measurementId) measurementIds.push(measurementId);
      }

      pageToken = page.nextPageToken || null;
    } catch (error) {
      // A single inaccessible property must not hide every other property.
      warnings.push(
        diagnosticFromError(error, {
          provider: 'google_analytics',
          stage: `dataStreams:${propertyId}`,
          scope: GA4_READONLY_SCOPE,
        })
      );
      break;
    }

    pageCount += 1;
    if (pageCount >= 20) break;
  } while (pageToken);

  return { measurementIds: [...new Set(measurementIds)], warnings };
}

export async function discoverGa4PropertiesDetailed(
  accessToken: string
): Promise<Ga4DiscoveryResult> {
  const summaries = await readAllAccountSummaries(accessToken);
  const properties: Array<{
    propertyId: string;
    displayName: string;
    accountName: string | null;
  }> = [];
  let accountCount = 0;

  for (const page of summaries) {
    for (const account of page.accountSummaries ?? []) {
      accountCount += 1;

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
  }

  const resolved: Ga4PropertySummary[] = [];
  const warnings: ProviderErrorDiagnostic[] = [];

  for (const property of properties) {
    const streams = await readAllDataStreams(accessToken, property.propertyId);
    warnings.push(...streams.warnings);
    resolved.push({ ...property, measurementIds: streams.measurementIds });
  }

  return { properties: resolved, warnings, accountCount };
}

export async function discoverGa4Properties(accessToken: string): Promise<Ga4PropertySummary[]> {
  const result = await discoverGa4PropertiesDetailed(accessToken);
  return result.properties;
}

export function chooseGa4Property(
  properties: Ga4PropertySummary[],
  options: { measurementId?: string; override?: string | null } = {}
): Ga4PropertySummary | null {
  const measurementId = options.measurementId || WEBSITE_ANALYTICS_MEASUREMENT_ID;
  const override = (options.override ?? getGooglePropertyOverride())?.replace(/^properties\//, '');

  if (override) {
    // The environment override is a request to use a specific property, not
    // proof that the property exists or is readable by this Google account.
    return properties.find((property) => property.propertyId === override) ?? null;
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

export async function listSearchConsoleSites(accessToken: string): Promise<SearchConsoleSite[]> {
  const raw = await fetchJson<SitesResponse>(
    `${WEBMASTERS_API}/sites`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    {
      provider: 'search_console',
      retries: 2,
      label: 'sites',
      stage: 'sites',
      scope: GSC_READONLY_SCOPE,
    }
  );

  return (raw.siteEntry ?? [])
    .filter((site) => Boolean(site.siteUrl))
    .map((site) => ({
      siteUrl: site.siteUrl as string,
      permissionLevel: site.permissionLevel || 'unknown',
    }));
}

export function hasSearchConsoleReadPermission(permissionLevel: string): boolean {
  return (
    permissionLevel === 'siteOwner' ||
    permissionLevel === 'siteFullUser' ||
    permissionLevel === 'siteRestrictedUser' ||
    permissionLevel === 'unknown'
  );
}

function permissionRank(permissionLevel: string): number {
  if (permissionLevel === 'siteOwner') return 3;
  if (permissionLevel === 'siteFullUser') return 2;
  if (permissionLevel === 'siteRestrictedUser') return 1;
  return 0;
}

export function chooseSearchConsoleSite(
  sites: SearchConsoleSite[],
  options: { siteUrl?: string | null } = {}
): SearchConsoleSite | null {
  const override = options.siteUrl ?? getSearchConsoleSiteOverride();

  if (override) {
    const normalizedOverride = normalizeSiteUrl(override);

    // An explicitly configured site must still be present in the account's
    // actual site list. Never fabricate a connected property.
    return sites.find((site) => normalizeSiteUrl(site.siteUrl) === normalizedOverride) ?? null;
  }

  const host = new URL(getSiteUrl()).hostname;
  const matching = sites
    .filter((site) => siteMatchesHost(site.siteUrl, host))
    .filter((site) => hasSearchConsoleReadPermission(site.permissionLevel));

  return (
    matching.sort((first, second) => {
      const rank = permissionRank(second.permissionLevel) - permissionRank(first.permissionLevel);
      if (rank !== 0) return rank;

      const firstDomain = first.siteUrl.startsWith('sc-domain:') ? 1 : 0;
      const secondDomain = second.siteUrl.startsWith('sc-domain:') ? 1 : 0;
      return secondDomain - firstDomain;
    })[0] ?? null
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
          decoded = Buffer.from(authError.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
            'utf8'
          );
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
