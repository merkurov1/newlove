import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import {
  GA4_READONLY_SCOPE,
  GSC_READONLY_SCOPE,
  WEBSITE_ANALYTICS_MEASUREMENT_ID,
  getSyncOwnerSecret,
} from '@/lib/analytics/website/config';
import {
  chooseGa4Property,
  chooseSearchConsoleSite,
  discoverGa4Properties,
  exchangeGoogleCode,
  listSearchConsoleSites,
} from '@/lib/analytics/website/providers/oauth';
import { sealSecret, verifyState } from '@/lib/analytics/website/tokenCrypto';
import { upsertConnection, markConnectionError } from '@/lib/analytics/website/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'pierrot_analytics_oauth';
const RETURN_PATH = '/admin/pierrot/analytics';

type OAuthState = {
  uid: string;
  provider: string;
  nonce: string;
  exp: number;
};

function redirect(request: Request, params: Record<string, string>): NextResponse {
  const url = new URL(RETURN_PATH, request.url);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get('error');

  if (error) {
    return redirect(request, { connect: 'error', reason: error.slice(0, 80) });
  }

  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch {
    return redirect(request, { connect: 'error', reason: 'unauthorized' });
  }

  const code = url.searchParams.get('code');
  const stateValue = url.searchParams.get('state');

  if (!code || !stateValue) {
    return redirect(request, { connect: 'error', reason: 'missing_code_or_state' });
  }

  const state = verifyState<OAuthState>(stateValue, getSyncOwnerSecret());
  const cookieNonce = cookies().get(STATE_COOKIE)?.value;

  if (
    !state ||
    state.uid !== user.id ||
    state.exp < Date.now() ||
    !cookieNonce ||
    cookieNonce !== state.nonce
  ) {
    return redirect(request, { connect: 'error', reason: 'invalid_state' });
  }

  let tokens;
  try {
    tokens = await exchangeGoogleCode(code);
  } catch {
    return redirect(request, { connect: 'error', reason: 'token_exchange_failed' });
  }

  if (!tokens.refreshToken) {
    return redirect(request, { connect: 'error', reason: 'no_refresh_token' });
  }

  const store = getServerSupabaseClient({ useServiceRole: true });
  const sealed = sealSecret(tokens.refreshToken);
  const grantedScopes = (tokens.scope || '').split(' ').filter(Boolean);
  const gaGranted = grantedScopes.includes(GA4_READONLY_SCOPE);
  const gscGranted = grantedScopes.includes(GSC_READONLY_SCOPE);

  let gaResult = 'not_granted';
  let gscResult = 'not_granted';

  if (gaGranted) {
    try {
      const properties = await discoverGa4Properties(tokens.accessToken);
      const property = chooseGa4Property(properties, {});

      if (!property) {
        await upsertConnection(store, {
          provider: 'google_analytics',
          status: 'error',
          accountLabel: 'Google Analytics',
          externalId: null,
          externalMeta: {
            error: 'ga4_property_not_found',
            measurement_id: WEBSITE_ANALYTICS_MEASUREMENT_ID,
            properties_seen: properties.map((item) => ({
              property_id: item.propertyId,
              display_name: item.displayName,
              measurement_ids: item.measurementIds,
            })),
          },
          scopes: grantedScopes,
          sealed,
          connectedBy: user.id,
        });
        await markConnectionError(
          store,
          'google_analytics',
          'ga4_property_not_found',
          `No GA4 property matched measurement id ${WEBSITE_ANALYTICS_MEASUREMENT_ID}. Set ANALYTICS_GA4_PROPERTY_ID or grant access to the correct property.`
        );
        gaResult = 'property_not_found';
      } else {
        await upsertConnection(store, {
          provider: 'google_analytics',
          status: 'connected',
          accountLabel: property.accountName
            ? `${property.accountName} · ${property.displayName}`
            : property.displayName,
          externalId: property.propertyId,
          externalMeta: {
            property_id: property.propertyId,
            display_name: property.displayName,
            account_name: property.accountName,
            measurement_ids: property.measurementIds,
            matched_measurement_id: property.measurementIds[0] ?? null,
          },
          scopes: grantedScopes,
          sealed,
          connectedBy: user.id,
        });
        gaResult = 'connected';
      }
    } catch {
      try {
        await upsertConnection(store, {
          provider: 'google_analytics',
          status: 'error',
          accountLabel: 'Google Analytics',
          externalId: null,
          externalMeta: { error: 'ga4_property_discovery_failed' },
          scopes: grantedScopes,
          sealed,
          connectedBy: user.id,
        });
        await markConnectionError(
          store,
          'google_analytics',
          'ga4_property_discovery_failed',
          'Google Admin API property discovery failed. Check that the Analytics Admin API is enabled.'
        );
      } catch {
        // The redirect still reports the failure.
      }
      gaResult = 'property_discovery_failed';
    }
  }

  if (gscGranted) {
    try {
      const sites = await listSearchConsoleSites(tokens.accessToken);
      const site = chooseSearchConsoleSite(sites, {});

      if (!site) {
        await upsertConnection(store, {
          provider: 'search_console',
          status: 'error',
          accountLabel: 'Search Console',
          externalId: null,
          externalMeta: { error: 'gsc_site_not_found', sites: sites.length },
          scopes: grantedScopes,
          sealed,
          connectedBy: user.id,
        });
        await markConnectionError(
          store,
          'search_console',
          'gsc_site_not_found',
          'No Search Console property matched the site host. Set ANALYTICS_GSC_SITE_URL to sc-domain:merkurov.love or the exact property URL.'
        );
        gscResult = 'site_not_found';
      } else {
        await upsertConnection(store, {
          provider: 'search_console',
          status: 'connected',
          accountLabel: site.siteUrl,
          externalId: site.siteUrl,
          externalMeta: {
            permission_level: site.permissionLevel,
            sites_available: sites.length,
          },
          scopes: grantedScopes,
          sealed,
          connectedBy: user.id,
        });
        gscResult = 'connected';
      }
    } catch {
      try {
        await upsertConnection(store, {
          provider: 'search_console',
          status: 'error',
          accountLabel: 'Search Console',
          externalId: null,
          externalMeta: { error: 'gsc_site_discovery_failed' },
          scopes: grantedScopes,
          sealed,
          connectedBy: user.id,
        });
        await markConnectionError(
          store,
          'search_console',
          'gsc_site_discovery_failed',
          'Search Console site discovery failed. Check that the Search Console API is enabled.'
        );
      } catch {
        // The redirect still reports the failure.
      }
      gscResult = 'site_discovery_failed';
    }
  }

  const response = redirect(request, {
    connect: gaResult === 'connected' || gscResult === 'connected' ? 'success' : 'partial',
    ga: gaResult,
    gsc: gscResult,
  });

  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/google-analytics',
    maxAge: 0,
  });
  return response;
}
