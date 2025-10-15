import { NextResponse } from 'next/server';
import getUserAndSupabaseForRequest from '@/lib/getUserAndSupabaseForRequest';

export async function GET(req: Request) {
  try {
    const { supabase, user } = await getUserAndSupabaseForRequest(req as any);
    if (!user) return NextResponse.json({ user: null, roles: [] });

    // Try service-role to read roles reliably
    try {
      const { getServerSupabaseClient } = await import('@/lib/serverAuth');
      const svc = getServerSupabaseClient({ useServiceRole: true });
      const res = await (svc as any).from('user_roles').select('role_id,roles(name)').eq('user_id', user.id);
      if (!res.error && Array.isArray(res.data)) {
        const roles = res.data.flatMap((r: any) => {
          const roleList = r.roles;
          if (Array.isArray(roleList)) return roleList.map((x: any) => String(x.name).toUpperCase());
          if (roleList) return [String(roleList.name).toUpperCase()];
          return [] as string[];
        });
        return NextResponse.json({ user: { id: user.id, email: user.email }, roles });
      }
    } catch (e) {
      // fallback
    }

    return NextResponse.json({ user: { id: user.id, email: user.email }, roles: [] });
  } catch (e) {
    return NextResponse.json({ user: null, roles: [] });
  }
}

export const dynamic = 'force-dynamic';
