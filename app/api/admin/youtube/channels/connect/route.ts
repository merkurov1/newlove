import { isAuthenticationError } from '@/lib/auth/errors';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

import { getGoogleOAuthConfig, getSyncOwnerSecret } from '@/lib/analytics/website/config';
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
import { checkYouTubeMultichannelSchema, isYouTubeProjectSlug } from '@/lib/youtube/channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The OAuth preflight makes one bounded request to Google. Give the route room
// for it on serverless platforms instead of returning a platform timeout.
export const maxDuration = 30;

const STATE_COOKIE = 'pierrot_youtube_channels_oauth';

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  return response;
}

function fail(
  request: Request,
  reason: string,
  project: string,
  extra: Record<string, string> = {}
) {
  const url = new URL('/admin/pierrot/youtube', request.url);
  url.searchParams.set('youtube_channels', 'error');
  url.searchParams.set('reason', reason.slice(0, 120));
  url.searchParams.set('project', project);

  for (const [key, value] of Object.entries(extra)) {
    if (value) url.searchParams.set(key, value.slice(0, 240));
  }

  return noStore(NextResponse.redirect(url));
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

    // This endpoint is opened as a normal browser navigation. Redirect back to
    // the workspace with an explicit reason instead of rendering raw JSON, so
    // an expired session is visible and actionable.
    const rawProject = new URL(request.url).searchParams.get('project');
    const project = isYouTubeProjectSlug(rawProject) ? rawProject : 'art-engine';
    return fail(request, 'unauthorized', project);
  }

  const url = new URL(request.url);
  const rawProject = url.searchParams.get('project');
  const project = isYouTubeProjectSlug(rawProject) ? rawProject : 'art-engine';
  const config = getGoogleOAuthConfig();

  if (!config.configured) {
    // Return to the page with an actionable notice instead of a raw JSON
    // response that a normal browser click renders as an opaque document.
    return fail(request, 'google_oauth_not_configured', project, {
      missing: config.missing.join(','),
    });
  }

  let store;
  try {
    store = getServerSupabaseClient({ useServiceRole: true });
  } catch (error) {
    console.error('[youtube-channels-connect] service client unavailable', error);
    return fail(request, 'server_configuration_error', project);
  }

  const schema = await checkYouTubeMultichannelSchema(store);

  if (!schema.ready) {
    return fail(request, 'migration_required', project, {
      missing: schema.missingTables.join(','),
    });
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

  let consentUrl: string;

  try {
    consentUrl = buildGoogleConsentUrl({
      state,
      loginHint,
      selectAccount,
      scopes: YOUTUBE_CHANNEL_CONNECTION_SCOPES,
      redirectUri: getYouTubeChannelsRedirectUri(),
    });
  } catch (error) {
    console.error('[youtube-channels-connect] consent URL could not be built', error);
    return fail(request, 'google_oauth_not_configured', project);
  }

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

  return noStore(response);
}
