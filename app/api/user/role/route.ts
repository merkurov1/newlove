import { NextResponse } from 'next/server';
import getUserAndSupabaseForRequest from '@/lib/getUserAndSupabaseForRequest';

export async function GET(req: Request) {
  try {
    const { supabase, user } = await getUserAndSupabaseForRequest(req as any);
    if (!user) return NextResponse.json({ role: 'ANON' });

    // Prefer already-resolved role from user object
    let role = (user.user_metadata && user.user_metadata.role) || user.role || 'USER';

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
            if (Array.isArray(roleList)) return roleList.some((roleObj: any) => roleObj.name === 'ADMIN');
            return roleList?.name === 'ADMIN';
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
