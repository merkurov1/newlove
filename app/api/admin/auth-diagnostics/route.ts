import { NextResponse } from 'next/server';

import {
  AuthenticationError,
  isAuthenticationError,
  requireAdminFromRequest,
} from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function requestFlags(request: Request) {
  const cookieHeader = request.headers.get('cookie') || '';

  return {
    // Booleans only. Cookie values and tokens never leave the server.
    hasCookieHeader: cookieHeader.length > 0,
    hasSupabaseSessionCookie: /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(cookieHeader),
    hasAuthorizationHeader: Boolean(request.headers.get('authorization')),
    hasAdminSecretHeader: Boolean(request.headers.get('x-admin-secret')),
    hasTelegramInitData: Boolean(request.headers.get('x-telegram-init-data')),
  };
}

/**
 * Owner-only diagnostics for the exact admin credential path used by
 * `/api/admin/*` routes (including YouTube status/connect).
 *
 * The browser admin page is rendered through the server component session
 * path. This endpoint proves whether the *API* request carries a usable
 * session and whether the account's canonical role is ADMIN, without exposing
 * cookies, tokens, email addresses or user ids.
 */
export async function GET(request: Request) {
  const flags = requestFlags(request);

  try {
    const user = await requireAdminFromRequest(request);

    return noStore({
      ok: true,
      authenticated: true,
      authorized: true,
      role: user.role,
      authMethod: user.authMethod ?? null,
      profileSource: user.profileSource ?? null,
      request: flags,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (!isAuthenticationError(error)) {
      console.error('[admin-auth-diagnostics] unexpected failure', error);
      return noStore(
        {
          ok: false,
          authenticated: null,
          authorized: false,
          error: 'diagnostics_failed',
          code: 'application_error',
          message:
            'Диагностика не смогла прочитать профиль: это ошибка приложения, а не отказ авторизации. Проверьте серверный лог.',
          request: flags,
          checkedAt: new Date().toISOString(),
        },
        500
      );
    }

    const authError = error as AuthenticationError;
    const authenticated = authError.code === 'auth_admin_required';

    return noStore(
      {
        ok: false,
        authenticated,
        authorized: false,
        error: 'Unauthorized',
        code: authError.code,
        reason: authError.reason,
        message:
          authError.code === 'auth_admin_required'
            ? 'Сессия действительна, но аккаунт не имеет роли ADMIN в canonical users.role.'
            : 'Supabase не увидел действительную cookie-сессию. Войдите снова и повторите.',
        request: flags,
        checkedAt: new Date().toISOString(),
      },
      authError.code === 'auth_admin_required' ? 403 : 401
    );
  }
}
