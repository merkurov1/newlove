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
        // Derive best-effort display name and avatar from Supabase user object
        const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name || user.user_metadata.display_name || user.user_metadata.preferred_username || user.user_metadata.given_name)) || user.name || null;
        const image = (user.user_metadata && (user.user_metadata.avatar_url || user.user_metadata.picture || user.user_metadata.image || user.user_metadata.avatar)) || (user as any).picture || (user as any).image || null;
        return NextResponse.json({ user: { id: user.id, email: user.email, name, image }, roles });
      }
    } catch (e) {
      // fallback
    }

    // If roles not found, still return user with name/image if available
    const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name || user.user_metadata.display_name || user.user_metadata.preferred_username || user.user_metadata.given_name)) || user.name || null;
    const image = (user.user_metadata && (user.user_metadata.avatar_url || user.user_metadata.picture || user.user_metadata.image || user.user_metadata.avatar)) || (user as any).picture || (user as any).image || null;
    return NextResponse.json({ user: { id: user.id, email: user.email, name, image }, roles: [] });
  } catch (e) {
    return NextResponse.json({ user: null, roles: [] });
  }
}

export const dynamic = 'force-dynamic';
