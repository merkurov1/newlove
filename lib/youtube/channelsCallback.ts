import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { getSyncOwnerSecret, getYouTubeChannelsRedirectUri } from '@/lib/analytics/website/config';
import { exchangeGoogleCode, fetchGoogleUserInfo } from '@/lib/analytics/website/providers/oauth';
import { sealSecret, verifyState } from '@/lib/analytics/website/tokenCrypto';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import { listMyChannels } from '@/lib/youtube/api';
import {
  isYouTubeProjectSlug,
  replaceConnectionChannels,
  saveOAuthConnection,
} from '@/lib/youtube/channels';
import {
  YOUTUBE_ANALYTICS_READONLY_SCOPE,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
  missingYouTubeScopes,
} from '@/lib/youtube/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'pierrot_youtube_channels_oauth';
const RETURN_PATH = '/admin/pierrot/youtube';

type OAuthState = {
  uid: string;
  purpose: string;
  project: string;
  nonce: string;
  exp: number;
};

const REQUIRED_SCOPES = [
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_ANALYTICS_READONLY_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
];

function redirect(request: Request, params: Record<string, string>, project: string): NextResponse {
  const url = new URL(RETURN_PATH, request.url);
  for (const [key, value] of Object.entries({ ...params, project })) {
    if (value) url.searchParams.set(key, value);
  }
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: url.toString(),
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
    },
  });
}

function exchangeReason(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code || '');
    if (code) return code.slice(0, 80);
  }
  return 'token_exchange_failed';
}

/**
 * Safe, structured callback diagnostics.
 *
 * Only stage/reason/project and non-sensitive counters reach the logs. The
 * authorization code, signed state, tokens and Google account email are never
 * included. This makes a failed consent/discovery/persistence step visible in
 * Vercel logs instead of only in the redirected page.
 */
function logCallbackFailure(stage: string, reason: string, project: string): void {
  console.warn('[youtube-channels-callback] failed', {
    stage,
    reason: reason.slice(0, 80),
    project,
  });
}

export async function handleYouTubeChannelsCallback(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  const stateValue = url.searchParams.get('state');
  const state = stateValue ? verifyState<OAuthState>(stateValue, getSyncOwnerSecret()) : null;
  const stateProject = state && isYouTubeProjectSlug(state.project) ? state.project : 'art-engine';

  if (error) {
    const reason = error.slice(0, 80);
    logCallbackFailure('google_consent', reason, stateProject);
    return redirect(request, { youtube_channels: 'error', reason }, stateProject);
  }

  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch {
    logCallbackFailure('admin_auth', 'unauthorized', stateProject);
    return redirect(request, { youtube_channels: 'error', reason: 'unauthorized' }, stateProject);
  }

  const code = url.searchParams.get('code');

  if (!code || !stateValue) {
    logCallbackFailure('callback_input', 'missing_code_or_state', stateProject);
    return redirect(
      request,
      { youtube_channels: 'error', reason: 'missing_code_or_state' },
      stateProject
    );
  }

  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get(STATE_COOKIE)?.value;

  if (
    !state ||
    state.purpose !== 'youtube_channels' ||
    state.uid !== user.id ||
    state.exp < Date.now() ||
    !cookieNonce ||
    cookieNonce !== state.nonce
  ) {
    logCallbackFailure('state_verification', 'invalid_state', stateProject);
    return redirect(request, { youtube_channels: 'error', reason: 'invalid_state' }, stateProject);
  }

  const project = isYouTubeProjectSlug(state.project) ? state.project : 'art-engine';

  let tokens;
  try {
    tokens = await exchangeGoogleCode(code, {
      redirectUri: getYouTubeChannelsRedirectUri(),
    });
  } catch (exchangeError) {
    const reason = exchangeReason(exchangeError);
    logCallbackFailure('token_exchange', reason, project);
    return redirect(request, { youtube_channels: 'error', reason }, project);
  }

  const grantedScopes = (tokens.scope || '').split(' ').filter(Boolean);
  const missingScopes = missingYouTubeScopes(grantedScopes, REQUIRED_SCOPES);

  if (missingScopes.length > 0) {
    logCallbackFailure('scope_validation', 'missing_scopes', project);
    return redirect(
      request,
      {
        youtube_channels: 'error',
        reason: 'missing_scopes',
        missing: missingScopes.map((scope) => scope.split('/').pop()).join(','),
      },
      project
    );
  }

  let identity;
  try {
    identity = await fetchGoogleUserInfo(tokens.accessToken);
  } catch {
    logCallbackFailure('google_identity', 'google_identity_unavailable', project);
    return redirect(
      request,
      { youtube_channels: 'error', reason: 'google_identity_unavailable' },
      project
    );
  }

  // The Google account email is the human-readable identity shown in the UI
  // and the unique key of one grant. Never invent a synthetic address: that
  // would make two accounts indistinguishable and could create a duplicate
  // grant that the owner cannot recognise. `openid email` are requested, so a
  // missing email means the identity lookup genuinely failed.
  if (!identity.email) {
    logCallbackFailure('google_identity', 'google_identity_unavailable', project);
    return redirect(
      request,
      { youtube_channels: 'error', reason: 'google_identity_unavailable' },
      project
    );
  }

  let sealed = null;
  try {
    sealed = tokens.refreshToken ? sealSecret(tokens.refreshToken) : null;
  } catch {
    logCallbackFailure('token_encryption', 'token_encryption_unavailable', project);
    return redirect(
      request,
      { youtube_channels: 'error', reason: 'token_encryption_unavailable' },
      project
    );
  }

  const store = getServerSupabaseClient({ useServiceRole: true });

  let connection;
  try {
    connection = await saveOAuthConnection(store, {
      ownerId: user.id,
      googleAccountEmail: identity.email,
      googleAccountId: identity.subject,
      googleAccountName: identity.name,
      scopes: grantedScopes,
      sealed,
    });
  } catch (saveError) {
    const reason = exchangeReason(saveError);
    logCallbackFailure('connection_persistence', reason, project);
    return redirect(request, { youtube_channels: 'error', reason }, project);
  }

  // One Google account may expose several channels, including Brand Accounts.
  // Every channel is stored; the owner still chooses which channel to bind.
  // `complete` is false when discovery hit its page cap: a truncated list is
  // not proof that the omitted channels lost access.
  let channels;
  try {
    channels = await listMyChannels({ accessToken: tokens.accessToken });
    await replaceConnectionChannels(store, {
      connectionId: connection.id,
      ownerId: user.id,
      channels: channels.channels,
      complete: !channels.truncated,
    });
  } catch (channelError) {
    const reason = exchangeReason(channelError);
    logCallbackFailure('channel_discovery', reason, project);
    return redirect(
      request,
      {
        youtube_channels: 'channels_failed',
        reason,
      },
      project
    );
  }

  console.info('[youtube-channels-callback] connected', {
    project,
    channelCount: channels.channels.length,
    truncated: channels.truncated,
    refreshTokenStored: Boolean(tokens.refreshToken || connection.hasRefreshToken),
  });

  const response = redirect(
    request,
    {
      youtube_channels: 'connected',
      channels: String(channels.channels.length),
      truncated: channels.truncated ? '1' : '',
    },
    project
  );

  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 0,
  });

  return response;
}
