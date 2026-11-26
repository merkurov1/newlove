import { NextRequest, NextResponse } from 'next/server';

import {
  decryptFacebookPageSelection,
  FACEBOOK_OAUTH_PAGES_COOKIE,
  missingFacebookScopes,
  readFacebookOAuthConfig,
  verifyFacebookPageAccess,
} from '@/lib/meta/facebookOAuth';
import { getFacebookAdminStore, saveFacebookPageConnection } from '@/lib/meta/facebookConnection';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function redirectToAnalytics(
  request: NextRequest,
  params: Record<string, string>,
  clearPages = true
): NextResponse {
  const target = new URL('/admin/pierrot/analytics', request.url);

  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(target, 303);

  if (clearPages) {
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

  response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}

/**
 * Stores the Page explicitly chosen after an OAuth login that can access more
 * than one Page. The encrypted, HttpOnly cookie from the callback is the only
 * source of Page tokens; the browser submits only the Page ID.
 */
export async function POST(request: NextRequest) {
  let adminId: string | null = null;

  try {
    const user = await requireAdminFromRequest(request);
    adminId = user.id;
  } catch {
    return NextResponse.redirect(new URL('/403', request.url));
  }

  const config = readFacebookOAuthConfig();

  if (!config.configured || !config.appSecret) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'not_configured',
    });
  }

  const form = await request.formData().catch(() => null);
  const pageId = String(form?.get('page_id') ?? '').trim();

  if (!pageId) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'page_not_selected',
    });
  }

  const encryptedPages = request.cookies.get(FACEBOOK_OAUTH_PAGES_COOKIE)?.value;
  const selection = decryptFacebookPageSelection(encryptedPages, config.appSecret);

  if (!selection) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'selection_expired',
    });
  }

  const selectedPage = selection.pages.find((page) => page.id === pageId);

  if (!selectedPage) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'page_not_found',
    });
  }

  const missing = missingFacebookScopes(selection.permissions);

  if (missing.length > 0) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'permissions_missing',
      missing: missing.join(','),
    });
  }

  const access = await verifyFacebookPageAccess({
    config,
    pageId: selectedPage.id,
    pageToken: selectedPage.accessToken,
  });

  if (!access.ok) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'page_token_invalid',
    });
  }

  const store = getFacebookAdminStore();

  if (!store) {
    return redirectToAnalytics(request, {
      facebook: 'error',
      reason: 'storage_unavailable',
    });
  }

  try {
    await saveFacebookPageConnection(store, {
      pageId: access.id,
      pageName: access.name,
      pageToken: selectedPage.accessToken,
      scopes: selection.permissions,
      tasks: access.tasks,
      permissions: selection.permissions,
      userId: selection.userId,
      connectedBy: adminId,
    });
  } catch {
    console.error('[meta/facebook/select] Could not store the encrypted Page token.');
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
