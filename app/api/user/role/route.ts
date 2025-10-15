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

    // If still not ADMIN, try to check user_roles via a server-side client using the service role key.
    // This avoids RLS blocking anonymous reads. We prefer an explicit service-role client; if it fails,
    // we fall back to any supabase client returned by the request helper.
    if (role !== 'ADMIN') {
      try {
        let rolesData: any = null;
        let rolesErr: any = null;
        let serviceSupabase: any = null;
        try {
          serviceSupabase = getServerSupabaseClient({ useServiceRole: true });
          const res = await (serviceSupabase as any)
            .from('user_roles')
            .select('role_id,roles(name)')
            .eq('user_id', user.id);
          rolesData = res.data;
          rolesErr = res.error;
          console.debug('[api/user/role] checked user_roles via service role client');
        } catch (e) {
          // Service role client may not be available in some environments; fall back to provided supabase client
          try {
            const res = await (supabase as any)
              .from('user_roles')
              .select('role_id,roles(name)')
              .eq('user_id', user.id);
            rolesData = res.data;
            rolesErr = res.error;
            console.debug('[api/user/role] checked user_roles via request supabase client (fallback)');
          } catch (e2) {
            // ignore
            rolesErr = e2;
          }
        }

        if (!rolesErr && Array.isArray(rolesData)) {
          // First try: inspect related `roles` payload (works when foreign key relationship exists)
          let hasAdmin = rolesData.some((r: any) => {
            const roleList: any = r.roles;
            if (Array.isArray(roleList)) return roleList.some((roleObj: any) => String(roleObj.name).toUpperCase() === 'ADMIN');
            return String(roleList?.name).toUpperCase() === 'ADMIN';
          });

          // Fallback: if `roles` relation not present, look up role names by role_id
          if (!hasAdmin) {
            const roleIds = rolesData.map((row: any) => row.role_id).filter(Boolean);
            if (roleIds.length) {
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
        // ignore
      }
    }

    return NextResponse.json({ role });
  } catch (e) {
    return NextResponse.json({ role: 'ANON' });
  }
}

export const dynamic = 'force-dynamic';
