import { NextResponse } from 'next/server';

import { getCurrentUser, getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

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

  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const { data, error } = await store
      .from('auth_trigger_errors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[auth-trigger-errors] list fetch failed');
      return NextResponse.json({ ok: false, error: 'fetch_failed' }, { status: 500 });
    }

    return NextResponse.json(
      { ok: true, data: data || [] },
      { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } }
    );
  } catch {
    console.error('[auth-trigger-errors] unexpected error');
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
