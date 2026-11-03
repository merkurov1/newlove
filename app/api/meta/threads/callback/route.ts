import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { requireAdminFromRequest } from '@/lib/serverAuth';
import {
  completeThreadsOAuth,
  decryptThreadsOAuthResult,
  encryptThreadsOAuthResult,
  readThreadsOAuthConfig,
  THREADS_OAUTH_RESULT_COOKIE,
  THREADS_OAUTH_RESULT_MAX_AGE_SECONDS,
  THREADS_OAUTH_STATE_COOKIE,
  THREADS_OAUTH_STATE_MAX_AGE_MS,
  verifyThreadsOAuthState,
} from '@/lib/meta/threadsOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function stateMatches(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function clearStateCookie(response: NextResponse): void {
  response.cookies.set({
    name: THREADS_OAUTH_STATE_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/meta/threads',
    maxAge: 0,
  });
}

function redirectToAdmin(request: NextRequest, params: Record<string, string>): NextResponse {
  const target = new URL('/admin/meta/threads', request.url);

  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(target);
  clearStateCookie(response);
  response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}

/**
 * Threads OAuth callback.
 *
 * The request is a top-level browser navigation from Threads, so the normal
 * Supabase admin cookie session is used. Every error path redirects to the
 * protected admin page and never exposes the code, token or app secret.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminFromRequest(request);
  } catch {
    return NextResponse.redirect(new URL('/403', request.url));
  }

  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const cookieState = request.cookies.get(THREADS_OAUTH_STATE_COOKIE)?.value;
  const config = readThreadsOAuthConfig();

  if (!config.configured || !config.appId || !config.appSecret) {
    return redirectToAdmin(request, {
      status: 'error',
      reason: 'not_configured',
    });
  }

  if (!state || !cookieState || !stateMatches(state, cookieState)) {
    return redirectToAdmin(request, {
      status: 'error',
      reason: 'invalid_state',
    });
  }

  const verified = verifyThreadsOAuthState(state, {
    secret: config.appSecret,
    maxAgeMs: THREADS_OAUTH_STATE_MAX_AGE_MS,
  });

  if (!verified.ok) {
    return redirectToAdmin(request, {
      status: 'error',
      reason: verified.reason === 'expired' ? 'expired_state' : 'invalid_state',
    });
  }

  const denied =
    url.searchParams.get('error') || url.searchParams.get('error_reason') === 'user_denied';

  if (denied) {
    return redirectToAdmin(request, {
      status: 'denied',
      reason: 'user_denied',
    });
  }

  const code = url.searchParams.get('code')?.replace(/#_$/u, '').trim();

  if (!code) {
    return redirectToAdmin(request, {
      status: 'error',
      reason: 'missing_code',
    });
  }

  const exchange = await completeThreadsOAuth({
    config,
    code,
    redirectUri: verified.redirectUri,
  });

  if (!exchange.ok) {
    // Never log the authorization code, token or app secret.
    console.error('[meta/threads/callback] OAuth token exchange failed.');

    return redirectToAdmin(request, {
      status: 'error',
      reason: 'exchange_failed',
    });
  }

  let encryptedResult: string;

  try {
    encryptedResult = encryptThreadsOAuthResult(exchange.token, config.appSecret);
  } catch {
    console.error('[meta/threads/callback] Could not protect OAuth result.');
    return redirectToAdmin(request, {
      status: 'error',
      reason: 'storage_failed',
    });
  }

  // Defensive check: the encrypted cookie must decrypt with the same secret
  // before it is handed to the admin page.
  if (!decryptThreadsOAuthResult(encryptedResult, config.appSecret)?.accessToken) {
    console.error('[meta/threads/callback] OAuth result integrity check failed.');
    return redirectToAdmin(request, {
      status: 'error',
      reason: 'storage_failed',
    });
  }

  const target = new URL('/admin/meta/threads', request.url);
  target.searchParams.set('status', 'connected');

  const response = NextResponse.redirect(target);
  clearStateCookie(response);
  response.cookies.set({
    name: THREADS_OAUTH_RESULT_COOKIE,
    value: encryptedResult,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/admin/meta/threads',
    maxAge: THREADS_OAUTH_RESULT_MAX_AGE_SECONDS,
  });
  response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}
