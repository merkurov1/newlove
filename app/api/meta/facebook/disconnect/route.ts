import { NextRequest, NextResponse } from 'next/server';

import {
  disableFacebookPageConnection,
  getFacebookAdminStore,
} from '@/lib/meta/facebookConnection';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { FACEBOOK_OAUTH_PAGES_COOKIE } from '@/lib/meta/facebookOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function redirectToAnalytics(request: NextRequest, params: Record<string, string>): NextResponse {
  const target = new URL('/admin/pierrot/analytics', request.url);

  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(target, 303);
  response.cookies.set({
    name: FACEBOOK_OAUTH_PAGES_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}

/**
 * Removes the encrypted Facebook Page token from the application database.
 * The token may remain valid on Meta until the owner removes the app from
 * their Facebook account, so the admin UI explains that revocation is a
 * separate action.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminFromRequest(request);
  } catch {
    return NextResponse.redirect(new URL('/403', request.url));
  }

  const store = getFacebookAdminStore();

  if (!store) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'storage_unavailable',
    });
  }

  try {
    await disableFacebookPageConnection(store);
  } catch {
    console.error('[meta/facebook/disconnect] Could not remove the Page token.');
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'disconnect_failed',
    });
  }

  return redirectToAnalytics(request, { facebook: 'disconnected' });
}
