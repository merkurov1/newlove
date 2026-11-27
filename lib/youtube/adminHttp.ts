import { NextResponse } from 'next/server';

/**
 * Shared 401 response for the YouTube owner API.
 *
 * The UI needs an explicit, non-secret reason so an expired browser session is
 * not mistaken for a broken Google/OAuth configuration. Only the request path
 * is reflected back; no tokens, cookies or profile data are included.
 */
export function youtubeAdminSignInUrl(request?: Request): string {
  let next = '/admin/pierrot/youtube';

  if (request) {
    try {
      const url = new URL(request.url);
      next = `${url.pathname}${url.search}` || next;
    } catch {
      // Fall back to the workspace page for malformed request URLs.
    }
  }

  return `/login?next=${encodeURIComponent(next)}`;
}

export function youtubeAdminUnauthorizedJson(request?: Request): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: 'unauthorized',
      code: 'admin_auth_required',
      message:
        'Сессия администратора не найдена или истекла. Войдите снова под аккаунтом владельца и повторите действие.',
      signInUrl: youtubeAdminSignInUrl(request),
    },
    {
      status: 401,
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    }
  );
}
