import { NextResponse } from 'next/server';
import getUserAndSupabaseForRequest from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient } from '@/lib/serverAuth';

export async function GET(req: Request) {
  try {
    // Resolve request-scoped user
    const { user, supabase } = await getUserAndSupabaseForRequest(req as any);
    if (!user || !user.id) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

    // Use service role to verify admin status via user_roles
    const svc = getServerSupabaseClient({ useServiceRole: true });
    try {
      const res = await (svc as any).from('user_roles').select('role_id,roles(name)').eq('user_id', user.id);
      if (res.error) {
        try { console.error('[auth-trigger-errors] role lookup error', res.error); } catch (e) {}
        return NextResponse.json({ ok: false, error: 'role_check_failed' }, { status: 500 });
      }
      const isAdmin = Array.isArray(res.data) && res.data.some((r: any) => {
        const roleList: any = r.roles;
        if (Array.isArray(roleList)) return roleList.some((x: any) => String(x.name).toUpperCase() === 'ADMIN');
        return String(roleList?.name || '').toUpperCase() === 'ADMIN';
      });
      if (!isAdmin) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    } catch (e) {
      try { console.error('[auth-trigger-errors] admin check failed', e); } catch (err) {}
      return NextResponse.json({ ok: false, error: 'role_check_failed' }, { status: 500 });
    }

    // Fetch recent errors
    try {
      const list = await (svc as any).from('auth_trigger_errors').select('*').order('created_at', { ascending: false }).limit(200);
      if (list.error) {
        try { console.error('[auth-trigger-errors] list fetch error', list.error); } catch (e) {}
        return NextResponse.json({ ok: false, error: 'fetch_failed' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, data: list.data || [] });
    } catch (e) {
      try { console.error('[auth-trigger-errors] unexpected', e); } catch (err) {}
      return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
    }
  } catch (e) {
    try { console.error('[auth-trigger-errors] top-level', e); } catch (err) {}
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
