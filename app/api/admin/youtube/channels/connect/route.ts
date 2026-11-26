import { isAuthenticationError } from '@/lib/auth/errors';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

import {
  getGoogleOAuthConfig,
  getSyncOwnerSecret,
} from '@/lib/analytics/website/config';
import {
  buildGoogleConsentUrl,
  probeGoogleConsentUrl,
} from '@/lib/analytics/website/providers/oauth';
import { signState } from '@/lib/analytics/website/tokenCrypto';
import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import {
  YOUTUBE_CHANNEL_CONNECTION_SCOPES,
  getYouTubeChannelsRedirectUri,
} from '@/lib/youtube/config';
import {
  isYouTubeProjectSlug,
  youtubeMultichannelSchemaReady,
} from '@/lib/youtube/channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'pierrot_youtube_channels_oauth';

function fail(request: Request, reason: string, project: string) {
  const url = new URL('/admin/pierrot/youtube', request.url);
  url.searchParams.set('youtube_channels', 'error');
  url.searchParams.set('reason', reason);
  url.searchParams.set('project', project);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch (error) {
    if (!isAuthenticationError(error)) {
      console.error('[admin-auth]', error);
      throw error;
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawProject = url.searchParams.get('project');
  const project = isYouTubeProjectSlug(rawProject) ? rawProject : 'art-engine';
  const config = getGoogleOAuthConfig();

  if (!config.configured) {
    return NextResponse.json(
      { error: 'google_oauth_not_configured', missing: config.missing },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const store = getServerSupabaseClient({ useServiceRole: true });

  if (!(await youtubeMultichannelSchemaReady(store))) {
    return fail(request, 'migration_required', project);
  }

  const loginHint = url.searchParams.get('login_hint')?.trim() || null;
  const selectAccount = url.searchParams.get('select_account') !== 'false';
  const nonce = crypto.randomBytes(18).toString('base64url');

  const state = signState(
    {
      uid: user.id,
      purpose: 'youtube_channels',
      project,
      nonce,
      exp: Date.now() + 10 * 60 * 1000,
    },
    getSyncOwnerSecret()
  );

  const consentUrl = buildGoogleConsentUrl({
    state,
    loginHint,
    selectAccount,
    scopes: YOUTUBE_CHANNEL_CONNECTION_SCOPES,
    redirectUri: getYouTubeChannelsRedirectUri(),
  });

  const probe = await probeGoogleConsentUrl(consentUrl);

  if (!probe.ok) {
    return fail(request, probe.reason || 'oauth_preflight_failed', project);
  }

  const response = NextResponse.redirect(consentUrl);
  response.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    // Both the default management callback and the optional dedicated
    // callback live below /api/auth, so the nonce cookie reaches either one.
    path: '/api/auth',
    maxAge: 600,
  });

  return response;
}
