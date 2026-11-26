import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import {
  encryptFacebookPageSelection,
  exchangeFacebookAuthorizationCode,
  exchangeFacebookLongLivedUserToken,
  fetchFacebookGrantedPermissions,
  fetchFacebookPages,
  FACEBOOK_OAUTH_PAGES_COOKIE,
  FACEBOOK_OAUTH_PAGES_MAX_AGE_SECONDS,
  FACEBOOK_OAUTH_STATE_COOKIE,
  FACEBOOK_OAUTH_STATE_MAX_AGE_MS,
  missingFacebookScopes,
  readFacebookOAuthConfig,
  verifyFacebookOAuthState,
  verifyFacebookPageAccess,
} from '@/lib/meta/facebookOAuth';
import {
  getFacebookAdminStore,
  loadFacebookConnectionState,
  saveFacebookPageConnection,
} from '@/lib/meta/facebookConnection';
import { requireAdminFromRequest } from '@/lib/serverAuth';

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
    name: FACEBOOK_OAUTH_STATE_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/meta/facebook',
    maxAge: 0,
  });
}

function clearPagesCookie(response: NextResponse): void {
  response.cookies.set({
    name: FACEBOOK_OAUTH_PAGES_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

function redirectToAnalytics(request: NextRequest, params: Record<string, string>): NextResponse {
  const target = new URL('/admin/pierrot/analytics', request.url);

  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(target);
  clearStateCookie(response);
  clearPagesCookie(response);
  response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}

function pageCookie(response: NextResponse, value: string): void {
  response.cookies.set({
    name: FACEBOOK_OAUTH_PAGES_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: FACEBOOK_OAUTH_PAGES_MAX_AGE_SECONDS,
  });
}

/**
 * Facebook OAuth callback.
 *
 * The browser arrives here from the official Meta dialog, so the normal
 * Supabase admin cookie session is used. The server exchanges the code for a
 * long-lived User token, obtains the Page token, verifies that the token can
 * read the selected Page and stores only the encrypted Page token.
 */
export async function GET(request: NextRequest) {
  let adminId: string | null = null;

  try {
    const user = await requireAdminFromRequest(request);
    adminId = user.id;
  } catch {
    return NextResponse.redirect(new URL('/403', request.url));
  }

  const url = new URL(request.url);
  const config = readFacebookOAuthConfig();

  if (!config.configured || !config.appId || !config.appSecret) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'not_configured',
    });
  }

  const state = url.searchParams.get('state');
  const cookieState = request.cookies.get(FACEBOOK_OAUTH_STATE_COOKIE)?.value;

  if (!state || !cookieState || !stateMatches(state, cookieState)) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'invalid_state',
    });
  }

  const verified = verifyFacebookOAuthState(state, {
    secret: config.appSecret,
    maxAgeMs: FACEBOOK_OAUTH_STATE_MAX_AGE_MS,
  });

  if (!verified.ok) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: verified.reason === 'expired' ? 'expired_state' : 'invalid_state',
    });
  }

  const denied =
    url.searchParams.get('error') || url.searchParams.get('error_reason') === 'user_denied';

  if (denied) {
    return redirectToAnalytics(request, {
      facebook: 'denied',
      reason: 'user_denied',
    });
  }

  const code = url.searchParams.get('code')?.replace(/#_$/u, '').trim();

  if (!code) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'missing_code',
    });
  }

  const shortToken = await exchangeFacebookAuthorizationCode({
    config,
    code,
    redirectUri: verified.redirectUri,
  });

  if (!shortToken.ok) {
    // Never log the authorization code, app secret or any token.
    console.error('[meta/facebook/callback] Authorization code exchange failed.');
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'exchange_failed',
    });
  }

  const longToken = await exchangeFacebookLongLivedUserToken({
    config,
    shortLivedToken: shortToken.token.accessToken,
  });

  if (!longToken.ok) {
    console.error('[meta/facebook/callback] Long-lived user token exchange failed.');
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'long_lived_exchange_failed',
    });
  }

  const permissions = await fetchFacebookGrantedPermissions({
    config,
    userToken: longToken.token.accessToken,
  });

  if (permissions.ok) {
    const missing = missingFacebookScopes(permissions.permissions);

    if (missing.length > 0) {
      return redirectToAnalytics(request, {
        facebook: 'error',
        reason: 'permissions_missing',
        missing: missing.join(','),
      });
    }
  }

  const pageList = await fetchFacebookPages({
    config,
    userToken: longToken.token.accessToken,
  });

  if (!pageList.ok) {
    console.error('[meta/facebook/callback] Could not load Facebook Pages.');
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: pageList.error.includes('no Pages') ? 'no_pages' : 'pages_failed',
    });
  }

  const store = getFacebookAdminStore();
  let existingPageId: string | null = null;

  if (store) {
    try {
      const existing = await loadFacebookConnectionState({ store });
      existingPageId = existing.pageId;
    } catch {
      existingPageId = null;
    }
  }

  const environmentPageId = process.env.META_FACEBOOK_PAGE_ID?.trim() || null;
  const configuredPageId = environmentPageId || existingPageId;
  const pages = pageList.pages;
  let selectedPage = configuredPageId
    ? (pages.find((page) => page.id === configuredPageId) ?? null)
    : null;

  // A stale database Page ID should not block choosing another Page after a
  // reconnect. An explicit META_FACEBOOK_PAGE_ID remains strict.
  if (!selectedPage && !environmentPageId && pages.length === 1) {
    selectedPage = pages[0];
  }

  if (environmentPageId && !selectedPage) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'page_not_found',
    });
  }

  if (!selectedPage) {
    try {
      const encryptedPages = encryptFacebookPageSelection(
        {
          issuedAt: Date.now(),
          userId: adminId,
          permissions: permissions.ok ? permissions.permissions : [],
          pages,
        },
        config.appSecret
      );
      const response = redirectToAnalytics(request, { facebook: 'select' });
      pageCookie(response, encryptedPages);
      return response;
    } catch {
      return redirectToAnalytics(request, {
        facebook: 'error',
        reason: 'storage_failed',
      });
    }
  }

  const access = await verifyFacebookPageAccess({
    config,
    pageId: selectedPage.id,
    pageToken: selectedPage.accessToken,
  });

  if (!access.ok) {
    console.error('[meta/facebook/callback] Page access verification failed.');
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'page_token_invalid',
    });
  }

  if (!store) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'storage_unavailable',
    });
  }

  const userTokenExpiresAt = longToken.token.expiresIn
    ? new Date(Date.now() + longToken.token.expiresIn * 1000).toISOString()
    : null;

  try {
    await saveFacebookPageConnection(store, {
      pageId: access.id,
      pageName: access.name,
      pageToken: selectedPage.accessToken,
      scopes: permissions.ok ? permissions.permissions : [],
      tasks: access.tasks,
      permissions: permissions.ok ? permissions.permissions : [],
      userId: null,
      userTokenExpiresAt,
      connectedBy: adminId,
    });
  } catch {
    console.error('[meta/facebook/callback] Could not store the encrypted Page token.');
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'storage_failed',
    });
  }

  return redirectToAnalytics(request, {
    facebook: 'connected',
    page: access.id,
  });
}
