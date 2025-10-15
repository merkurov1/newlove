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
  } catch (e) {
    console.debug('[api/user/role] role lookup failed', e);
  }

    return NextResponse.json({ role });
  } catch (e) {
    return NextResponse.json({ role: 'ANON' });
  }
}

export const dynamic = 'force-dynamic';
