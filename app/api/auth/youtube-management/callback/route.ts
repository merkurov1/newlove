import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import {
  getSyncOwnerSecret,
  getYouTubeManagementRedirectUri,
} from '@/lib/analytics/website/config';
import { exchangeGoogleCode, fetchGoogleUserInfo } from '@/lib/analytics/website/providers/oauth';
import { verifyState, sealSecret } from '@/lib/analytics/website/tokenCrypto';
import { getStoredConnection } from '@/lib/analytics/website/store';
import { handleYouTubeChannelsCallback } from '@/lib/youtube/channelsCallback';
import { runYouTubeManagementDiscovery } from '@/lib/youtube/discovery';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'pierrot_youtube_management_oauth';
const RETURN_PATH = '/admin/pierrot/youtube';

type OAuthState = {
  uid: string;
  purpose: string;
  project: string;
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

function exchangeReason(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code || '');
    if (code) return code.slice(0, 80);
  }
  return 'token_exchange_failed';
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  // The multi-channel flow reuses this already-registered callback by default.
  // Its signed state carries a different purpose, so it is handled separately
  // and never touches the legacy single-channel management grant.
  const earlyState = url.searchParams.get('state');
  const earlyPayload = earlyState
    ? verifyState<{ purpose?: string }>(earlyState, getSyncOwnerSecret())
    : null;

  if (earlyPayload?.purpose === 'youtube_channels') {
    return handleYouTubeChannelsCallback(request);
  }

  const error = url.searchParams.get('error');

  if (error) {
    return redirect(request, { youtube_management: 'error', reason: error.slice(0, 80) });
  }

  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch {
    return redirect(request, { youtube_management: 'error', reason: 'unauthorized' });
  }

  const code = url.searchParams.get('code');
  const stateValue = url.searchParams.get('state');

  if (!code || !stateValue) {
    return redirect(request, { youtube_management: 'error', reason: 'missing_code_or_state' });
  }

  const state = verifyState<OAuthState>(stateValue, getSyncOwnerSecret());
  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get(STATE_COOKIE)?.value;

  if (
    !state ||
    state.purpose !== 'youtube_management' ||
    state.uid !== user.id ||
    state.exp < Date.now() ||
    !cookieNonce ||
    cookieNonce !== state.nonce
  ) {
    return redirect(request, { youtube_management: 'error', reason: 'invalid_state' });
  }

  let tokens;
  try {
    tokens = await exchangeGoogleCode(code, {
      redirectUri: getYouTubeManagementRedirectUri(),
    });
  } catch (exchangeError) {
    return redirect(request, {
      youtube_management: 'error',
      reason: exchangeReason(exchangeError),
    });
  }

  const store = getServerSupabaseClient({ useServiceRole: true });
  const existing = await getStoredConnection(store, 'youtube').catch(() => null);
  const identity = await fetchGoogleUserInfo(tokens.accessToken);
  const grantedScopes = (tokens.scope || '').split(' ').filter(Boolean);

  // A repeated consent may omit the refresh token. Keep the existing sealed
  // management credential in that case; only fail when there is nothing to
  // store at all.
  if (!tokens.refreshToken && !existing?.management_token_ciphertext) {
    return redirect(request, {
      youtube_management: 'error',
      reason: 'no_refresh_token',
    });
  }

  let sealed: ReturnType<typeof sealSecret> | null = null;
  try {
    sealed = tokens.refreshToken ? sealSecret(tokens.refreshToken) : null;
  } catch {
    return redirect(request, {
      youtube_management: 'error',
      reason: 'token_encryption_unavailable',
    });
  }

  const result = await runYouTubeManagementDiscovery(store, {
    accessToken: tokens.accessToken,
    scopes: grantedScopes,
    managementSealed: sealed,
    connectedBy: user.id,
    accountEmail: identity.email,
    accountName: identity.name,
    project: state.project,
  });

  const response = redirect(request, {
    youtube_management: result.status === 'connected' ? 'success' : result.status,
    youtube_management_project: state.project,
    project: state.project,
    ...(result.status === 'connected'
      ? { yt_channel: result.channelTitle || result.channelId || '' }
      : { reason: result.code || 'management_discovery_failed' }),
  });

  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/youtube-management',
    maxAge: 0,
  });

  return response;
}
