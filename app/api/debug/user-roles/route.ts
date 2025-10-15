import { NextResponse } from 'next/server';
import getUserAndSupabaseForRequest from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient } from '@/lib/serverAuth';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const queryUserId = url.searchParams.get('user_id');

    // If user_id query param is present, use it; otherwise resolve current user from request
    let userId = queryUserId || null;
    let supabaseFromReq: any = null;
    if (!userId) {
      const res = await getUserAndSupabaseForRequest(req as any);
      supabaseFromReq = res.supabase;
      const user = res.user;
      if (!user || !user.id) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
      userId = user.id;
    }

    // Use service role client to bypass RLS and inspect user_roles
    let svc: any = null;
    try {
      svc = getServerSupabaseClient({ useServiceRole: true });
    } catch (e) {
      svc = supabaseFromReq;
    }

    if (!svc) return NextResponse.json({ error: 'No DB client available' }, { status: 500 });

    try {
      const res = await (svc as any)
        .from('user_roles')
        .select('role_id,roles(id,name)')
        .eq('user_id', userId);
      if (res.error) {
        console.debug('[api/debug/user-roles] query error', res.error);
        return NextResponse.json({ error: res.error.message || String(res.error) }, { status: 500 });
      }
      return NextResponse.json({ user_id: userId, roles: res.data || [] });
    } catch (e) {
      console.debug('[api/debug/user-roles] fatal', e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
