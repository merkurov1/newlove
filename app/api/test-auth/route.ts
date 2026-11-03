import { NextResponse } from 'next/server';

import { getCurrentUser, requireAdminFromRequest } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Diagnostic endpoint is administrator-only in production.
 *
 * It deliberately returns no email, session, cookie, token or infrastructure
 * details. Unauthenticated requests get 401; authenticated non-admins get 403.
 */
export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req);
  } catch {
    let authenticated = false;

    try {
      authenticated = Boolean(await getCurrentUser());
    } catch {
      authenticated = false;
    }

    return NextResponse.json(
      { ok: false, error: authenticated ? 'Forbidden' : 'Unauthorized' },
      { status: authenticated ? 403 : 401 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      role: 'ADMIN',
      supabaseConfigured: Boolean(
        (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
        (process.env.SUPABASE_SERVICE_ROLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          process.env.SUPABASE_KEY)
      ),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    }
  );
}
