import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import {
  getSyncOwnerSecret,
  getYouTubeChannelsRedirectUri,
} from '@/lib/analytics/website/config';
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
} from '@/lib/analytics/website/providers/oauth';
import { sealSecret, verifyState } from '@/lib/analytics/website/tokenCrypto';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import { isAuthenticationError } from '@/lib/auth/errors';
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

function redirect(
  request: Request,
  params: Record<string, string>,
  project: string
): NextResponse {
  const url = new URL(RETURN_PATH, request.url);
  for (const [key, value] of Object.entries({ ...params, project })) {
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

/**
 * Structured, safe callback diagnostics. Only stage names, reason codes and
 * counts are logged: never codes, tokens, emails or other payload values.
 */
function logStage(stage: string, detail: Record<string, string | number | boolean> = {}): void {
  console.info('[youtube-channels-callback]', stage, detail);
}

export async function handleYouTubeChannelsCallback(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  const stateValue = url.searchParams.get('state');
  const state = stateValue ? verifyState<OAuthState>(stateValue, getSyncOwnerSecret()) : null;
  const stateProject =
    state && isYouTubeProjectSlug(state.project) ? state.project : 'art-engine';

  if (error) {
    logStage('google_error', { reason: error.slice(0, 80) });
    return redirect(request, { youtube_channels: 'error', reason: error.slice(0, 80) }, stateProject);
  }

  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch (authError) {
    if (!isAuthenticationError(authError)) {
      console.error('[youtube-channels-callback] auth backend failed', authError);
      return redirect(
        request,
        { youtube_channels: 'error', reason: 'auth_backend_error' },
        stateProject
      );
    }

    logStage('auth_denied', { reason: 'unauthorized' });
    return redirect(request, { youtube_channels: 'error', reason: 'unauthorized' }, stateProject);
  }

  const code = url.searchParams.get('code');

  if (!code || !stateValue) {
    logStage('missing_code_or_state', { hasCode: Boolean(code), hasState: Boolean(stateValue) });
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
    logStage('invalid_state', {
      hasState: Boolean(state),
      purposeMatches: state?.purpose === 'youtube_channels',
      uidMatches: state?.uid === user.id,
      expired: Boolean(state && state.exp < Date.now()),
      hasNonceCookie: Boolean(cookieNonce),
      nonceMatches: Boolean(state && cookieNonce === state.nonce),
    });
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
    logStage('token_exchange_failed', { reason });
    return redirect(request, { youtube_channels: 'error', reason }, project);
  }

  const grantedScopes = (tokens.scope || '').split(' ').filter(Boolean);
  const missingScopes = missingYouTubeScopes(grantedScopes, REQUIRED_SCOPES);

  if (missingScopes.length > 0) {
    logStage('missing_scopes', { count: missingScopes.length });
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
    logStage('identity_failed', { reason: 'google_identity_unavailable' });
    return redirect(
      request,
      { youtube_channels: 'error', reason: 'google_identity_unavailable' },
      project
    );
  }

  if (!identity.email && !identity.subject) {
    logStage('identity_missing', { hasEmail: false, hasSubject: false });
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
    logStage('encryption_failed', { reason: 'token_encryption_unavailable' });
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
      googleAccountEmail: identity.email || `${identity.subject}@google.invalid`,
      googleAccountId: identity.subject,
      googleAccountName: identity.name,
      scopes: grantedScopes,
      sealed,
    });
  } catch (saveError) {
    const reason = exchangeReason(saveError);
    logStage('save_failed', { reason });
    return redirect(request, { youtube_channels: 'error', reason }, project);
  }

  // One Google account may expose several channels, including Brand Accounts.
  // Every channel is stored; the owner still chooses which channel to bind.
  let channels;
  try {
    channels = await listMyChannels({ accessToken: tokens.accessToken });
    await replaceConnectionChannels(store, {
      connectionId: connection.id,
      ownerId: user.id,
      channels: channels.channels,
    });
  } catch (channelError) {
    const reason = exchangeReason(channelError);
    logStage('channels_failed', {
      reason,
      accountSaved: true,
    });
    return redirect(
      request,
      {
        youtube_channels: 'channels_failed',
        reason,
        account: connection.googleAccountEmail,
      },
      project
    );
  }

  logStage('connected', {
    channels: channels.channels.length,
    truncated: channels.truncated,
    hasRefreshToken: Boolean(tokens.refreshToken),
  });

  const response = redirect(
    request,
    {
      youtube_channels: 'connected',
      account: connection.googleAccountEmail,
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
