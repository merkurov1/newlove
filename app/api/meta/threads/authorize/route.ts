import { NextRequest, NextResponse } from 'next/server';

import { requireAdminFromRequest } from '@/lib/serverAuth';
import {
  buildThreadsAuthorizationUrl,
  createThreadsOAuthState,
  readThreadsOAuthConfig,
  resolveThreadsRedirectUri,
  THREADS_OAUTH_STATE_COOKIE,
  THREADS_OAUTH_STATE_MAX_AGE_MS,
} from '@/lib/meta/threadsOAuth';

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
 * Protected start of the Threads OAuth flow.
 *
 * The admin session is verified with the project's standard
 * `requireAdminFromRequest`. The app secret never leaves the server and the
 * state is a signed, expiring value bound to an HttpOnly cookie.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminFromRequest(request);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const config = readThreadsOAuthConfig();

  if (!config.configured || !config.appId || !config.appSecret) {
    return json(
      {
        error:
          'Threads OAuth is not configured. Set META_THREADS_APP_ID and META_THREADS_APP_SECRET.',
      },
      503
    );
  }

  const redirectUri = resolveThreadsRedirectUri(request.url);

  let state: string;

  try {
    state = createThreadsOAuthState({
      secret: config.appSecret,
      redirectUri,
    });
  } catch {
    return json({ error: 'Could not start the Threads OAuth flow.' }, 500);
  }

  const response = NextResponse.redirect(
    buildThreadsAuthorizationUrl({
      appId: config.appId,
      redirectUri,
      state,
    })
  );

  response.cookies.set({
    name: THREADS_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/meta/threads',
    maxAge: Math.floor(THREADS_OAUTH_STATE_MAX_AGE_MS / 1000),
  });
  response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}
