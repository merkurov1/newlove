import { NextResponse } from 'next/server';
import getUserAndSupabaseForRequest from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient } from '@/lib/serverAuth';

// Server-only debug endpoint. Returns information about user_roles and RPCs
// for the currently authenticated user, or for a provided `user_id` query param.
export async function GET(req: Request) {
  try {
    // Protect debug endpoints from being used in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const url = new URL(req.url);
    const queryUserId = url.searchParams.get('user_id');

    // Resolve user id either from query or from the incoming request
    let userId: string | null = queryUserId || null;
    let requestSupabase: any = null;
    if (!userId) {
      const res = await getUserAndSupabaseForRequest(req as any);
      requestSupabase = res.supabase;
      const user = res.user;
      if (!user || !user.id) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
      userId = user.id;
    }

    const out: any = { user_id: userId };

    // Expose presence of key env vars (without revealing values) to help debugging
    out.env = {
      has_SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      has_SUPABASE_URL: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
    };

    // Acquire service-role client if possible
    let svc: any = null;
    try {
      svc = getServerSupabaseClient({ useServiceRole: true });
    } catch (err) {
      out.service_client_error = String((err as any)?.message || err);
      svc = null;
    }

    out.service_client_available = Boolean(svc);

    const primaryClient = svc || requestSupabase;
    if (!primaryClient) return NextResponse.json({ error: 'No DB client available' }, { status: 500 });

    // Query user_roles via primary client
    try {
      const res = await primaryClient.from('user_roles').select('role_id,roles(id,name)').eq('user_id', userId);
      out.user_roles = { data: res.data || null, error: res.error || null };
    } catch (err) {
      out.user_roles = { error: String((err as any)?.message || err) };
    }

    // If role_ids exist, fetch roles separately
    try {
      const ids = (out.user_roles?.data || []).map((r: any) => r.role_id).filter(Boolean);
      if (ids.length && primaryClient) {
        const rr = await primaryClient.from('roles').select('id,name').in('id', ids);
        out.roles = { data: rr.data || null, error: rr.error || null };
      }
    } catch (err) {
      out.roles = { error: String((err as any)?.message || err) };
    }

    // Try RPCs using svc first, then request-scoped client
    out.rpc = {};
    const rpcCandidates = [] as any[];
    if (svc) rpcCandidates.push({ client: svc, kind: 'svc' });
    if (requestSupabase) rpcCandidates.push({ client: requestSupabase, kind: 'req' });

    for (const candidate of rpcCandidates) {
      const c = candidate.client;
      const k = candidate.kind;
      try {
        try {
          const r = await c.rpc('get_my_roles');
          out.rpc[`get_my_roles_${k}`] = r;
        } catch (err) {
          out.rpc[`get_my_roles_${k}`] = { error: String((err as any)?.message || err) };
        }
        try {
          const r = await c.rpc('get_my_user_roles');
          out.rpc[`get_my_user_roles_${k}`] = r;
        } catch (err) {
          out.rpc[`get_my_user_roles_${k}`] = { error: String((err as any)?.message || err) };
        }
        try {
          const r = await c.rpc('get_my_user_roles_any', { uid_text: userId });
          out.rpc[`get_my_user_roles_any_${k}`] = r;
        } catch (err) {
          out.rpc[`get_my_user_roles_any_${k}`] = { error: String((err as any)?.message || err) };
        }
      } catch (err) {
        out.rpc[`fatal_${k}`] = String((err as any)?.message || err);
      }
    }

    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: String((err as any)?.message || err) }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
