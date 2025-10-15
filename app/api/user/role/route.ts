import { NextResponse } from 'next/server';
import getUserAndSupabaseForRequest from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient } from '@/lib/serverAuth';

export async function GET(req: Request) {
  try {
    // Диагностика: логируем Authorization заголовок и результат авторизации
    try {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || null;
      if (authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
        const token = authHeader.slice(7).trim();
        console.debug('[api/user/role] Authorization header present, token prefix=', token.slice(0, 8));
      } else {
        console.debug('[api/user/role] Authorization header present:', Boolean(authHeader));
      }
    } catch (e) {
      console.debug('[api/user/role] cannot read authorization header', e);
    }

    const { supabase, user } = await getUserAndSupabaseForRequest(req as any);
    if (!user) {
      console.debug('[api/user/role] no user resolved for request; returning ANON');
      return NextResponse.json({ role: 'ANON' });
    }
    console.debug('[api/user/role] resolved user:', { id: user.id, role: (user.user_metadata?.role || user.role) });

  // Prefer already-resolved role from user object and normalize to uppercase
  let role = (user.user_metadata && user.user_metadata.role) || user.role || 'USER';
  role = String(role).toUpperCase();

  // Normalize common Supabase value 'authenticated' -> 'USER'
  if (role === 'AUTHENTICATED') role = 'USER';

  // Regardless of metadata, attempt a server-side lookup for roles membership (service role key)
  // This ensures that DB-assigned roles (user_roles -> roles) are detected even when user metadata
  // is not populated or contains a generic 'authenticated' value.
  try {
    let serviceSupabase: any = null;
    try {
      serviceSupabase = getServerSupabaseClient({ useServiceRole: true });
    } catch (e) {
      // Service client not available in environment; we'll fall back to request-scoped client below
      serviceSupabase = null;
    }

    let rolesData: any = null;
    let rolesErr: any = null;

    if (serviceSupabase) {
      const res = await (serviceSupabase as any)
        .from('user_roles')
        .select('role_id,roles(name)')
        .eq('user_id', user.id);
      rolesData = res.data;
      rolesErr = res.error;
      console.debug('[api/user/role] checked user_roles via service role client');
    } else {
      try {
        // Direct read may be blocked by RLS for request-scoped client.
        const res = await (supabase as any)
          .from('user_roles')
          .select('role_id,roles(name)')
          .eq('user_id', user.id);
        rolesData = res.data;
        rolesErr = res.error;
        console.debug('[api/user/role] checked user_roles via request supabase client (fallback)');
      } catch (e) {
        rolesErr = e;
      }
    }

    if (!rolesErr && Array.isArray(rolesData)) {
      // Check for ADMIN in related roles payload
      let hasAdmin = rolesData.some((r: any) => {
        const roleList: any = r.roles;
        if (Array.isArray(roleList)) return roleList.some((roleObj: any) => String(roleObj.name).toUpperCase() === 'ADMIN');
        return String(roleList?.name).toUpperCase() === 'ADMIN';
      });

      // If relation not present, lookup role names by role_id
      if (!hasAdmin) {
        const roleIds = rolesData.map((row: any) => row.role_id).filter(Boolean);
        if (roleIds.length && serviceSupabase) {
          try {
            const rRes = await (serviceSupabase as any).from('roles').select('id,name').in('id', roleIds);
            if (!rRes.error && Array.isArray(rRes.data)) {
              hasAdmin = rRes.data.some((rr: any) => String(rr.name).toUpperCase() === 'ADMIN');
            }
          } catch (e) {
            // ignore
          }
        }
      }

      if (hasAdmin) role = 'ADMIN';
    }
    // If the direct queries failed (RLS or missing service key), try a SECURITY DEFINER RPC
    // which many deployments create as a safe server-side helper: get_my_roles / get_my_user_roles(_any)
    if (role !== 'ADMIN' && (rolesErr || !Array.isArray(rolesData) || rolesData.length === 0)) {
      try {
        const rpcClient = serviceSupabase || supabase;
        let rpcResp: any = null;

        // Try common RPC names in order
        try {
          rpcResp = await (rpcClient as any).rpc('get_my_roles');
        } catch (e) {
          // ignore
        }
        if ((!rpcResp || rpcResp.error) && rpcClient) {
          try {
            rpcResp = await (rpcClient as any).rpc('get_my_user_roles');
          } catch (e) {
            // ignore
          }
        }
        if ((!rpcResp || rpcResp.error) && rpcClient) {
          try {
            rpcResp = await (rpcClient as any).rpc('get_my_user_roles_any', { uid_text: user.id });
          } catch (e) {
            // ignore
          }
        }

        if (rpcResp && !rpcResp.error && Array.isArray(rpcResp.data)) {
          const found = rpcResp.data.some((r: any) => {
            if (!r) return false;
            if (typeof r === 'string') return r.toUpperCase() === 'ADMIN';
            // object shape: { role: 'ADMIN' } or { name: 'ADMIN' }
            const vals = Object.values(r).map((v: any) => String(v).toUpperCase());
            return vals.includes('ADMIN');
          });
          if (found) {
            role = 'ADMIN';
            console.debug('[api/user/role] detected ADMIN via RPC');
          }
        } else if (rpcResp && rpcResp.error) {
          console.debug('[api/user/role] RPC call error', rpcResp.error);
        }
      } catch (e) {
        console.debug('[api/user/role] rpc fallback failed', e);
      }
    }
  } catch (e) {
    console.debug('[api/user/role] role lookup failed', e);
  }

    return NextResponse.json({ role });
  } catch (e) {
    return NextResponse.json({ role: 'ANON' });
  }
}

export const dynamic = 'force-dynamic';
