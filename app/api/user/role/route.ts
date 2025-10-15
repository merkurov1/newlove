import { NextResponse } from 'next/server';
import getUserAndSupabaseForRequest from '@/lib/getUserAndSupabaseForRequest';

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

    // If still not ADMIN, try to check user_roles via server supabase client
    if (role !== 'ADMIN' && supabase) {
      try {
        const { data: rolesData, error } = await (supabase as any)
          .from('user_roles')
          .select('role_id,roles(name)')
          .eq('user_id', user.id);
        if (!error && Array.isArray(rolesData)) {
          const hasAdmin = rolesData.some((r: any) => {
            const roleList: any = r.roles;
            if (Array.isArray(roleList)) return roleList.some((roleObj: any) => String(roleObj.name).toUpperCase() === 'ADMIN');
            return String(roleList?.name).toUpperCase() === 'ADMIN';
          });
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
