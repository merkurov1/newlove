import { NextRequest, NextResponse } from 'next/server';

import { requireAdminFromRequest } from '@/lib/serverAuth';
import {
  buildFacebookAuthorizationUrl,
  createFacebookOAuthState,
  FACEBOOK_OAUTH_STATE_COOKIE,
  FACEBOOK_OAUTH_STATE_MAX_AGE_MS,
  readFacebookOAuthConfig,
  resolveFacebookRedirectUri,
} from '@/lib/meta/facebookOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/**
 * Protected start of the Facebook Page OAuth flow.
 *
 * The admin session is verified before Meta is contacted. The state is a
 * signed, expiring value bound to an HttpOnly cookie; the app secret never
 * leaves the server.
 */
export async function GET(request: NextRequest) {
  let userId: string | null = null;

  try {
    const user = await requireAdminFromRequest(request);
    userId = user.id;
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const config = readFacebookOAuthConfig();

  if (!config.configured || !config.appId || !config.appSecret) {
    return json(
      {
        error:
          'Facebook OAuth is not configured. Set META_FACEBOOK_APP_ID and META_FACEBOOK_APP_SECRET.',
        missing: config.missing,
      },
      503
    );
  }

  const redirectUri = resolveFacebookRedirectUri(request.url);

  let state: string;

  try {
    state = createFacebookOAuthState({
      secret: config.appSecret,
      redirectUri,
      userId,
    });
  } catch {
    return json({ error: 'Could not start the Facebook OAuth flow.' }, 500);
  }

  const response = NextResponse.redirect(
    buildFacebookAuthorizationUrl({
      appId: config.appId,
      redirectUri,
      state,
      version: config.version,
      // Always allow Meta to re-ask a previously declined Page permission.
      // Without this, a second attempt silently omits the missing scope.
      reRequest: true,
    })
  );

  response.cookies.set({
    name: FACEBOOK_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/meta/facebook',
    maxAge: Math.floor(FACEBOOK_OAUTH_STATE_MAX_AGE_MS / 1000),
  });
  response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}
