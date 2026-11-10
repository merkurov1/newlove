import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import { getSyncOwnerSecret } from '@/lib/analytics/website/config';
import { exchangeGoogleCode } from '@/lib/analytics/website/providers/oauth';
import { AnalyticsProviderError } from '@/lib/analytics/website/providers/http';
import {
  resolveGoogleRefreshCredential,
  runGoogleDiscovery,
} from '@/lib/analytics/website/discovery';
import { verifyState } from '@/lib/analytics/website/tokenCrypto';
import { getStoredConnection } from '@/lib/analytics/website/store';

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

function tokenExchangeReason(error: unknown): string {
  if (error instanceof AnalyticsProviderError) {
    if (error.code === 'invalid_grant') return 'invalid_grant';
    if (error.code === 'redirect_uri_mismatch') return 'redirect_uri_mismatch';
    if (error.code === 'invalid_client') return 'invalid_client';
    if (error.code === 'network_error' || error.code === 'timeout') return error.code;
    return error.code || 'token_exchange_failed';
  }

  return 'token_exchange_failed';
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
  } catch (exchangeError) {
    return redirect(request, {
      connect: 'error',
      reason: tokenExchangeReason(exchangeError),
    });
  }

  const store = getServerSupabaseClient({ useServiceRole: true });
  const [existingGa, existingGsc] = await Promise.all([
    getStoredConnection(store, 'google_analytics').catch(() => null),
    getStoredConnection(store, 'search_console').catch(() => null),
  ]);

  const existingCredential =
    existingGa?.token_ciphertext || existingGsc?.token_ciphertext
      ? existingGa?.token_ciphertext
        ? existingGa
        : existingGsc
      : null;

  const credential = resolveGoogleRefreshCredential({
    newRefreshToken: tokens.refreshToken,
    existing: existingCredential,
  });

  // A re-authorization that does not return a new refresh token is normal.
  // Only fail when there is no previously stored credential to keep using.
  if (!credential.refreshToken) {
    return redirect(request, { connect: 'error', reason: 'no_refresh_token' });
  }

  const grantedScopes = (tokens.scope || '').split(' ').filter(Boolean);
  const results = await runGoogleDiscovery(store, {
    accessToken: tokens.accessToken,
    scopes: grantedScopes,
    sealed: credential.sealed,
    connectedBy: user.id,
  });

  const gaResult =
    results.find((result) => result.provider === 'google_analytics')?.status ?? 'not_granted';
  const gscResult =
    results.find((result) => result.provider === 'search_console')?.status ?? 'not_granted';
  const gaConnected = gaResult === 'connected';
  const gscConnected = gscResult === 'connected';

  const response = redirect(request, {
    connect:
      gaConnected && gscConnected ? 'success' : gaConnected || gscConnected ? 'partial' : 'error',
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
