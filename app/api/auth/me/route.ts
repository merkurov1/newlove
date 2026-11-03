import { NextResponse } from 'next/server';
import getUserAndSupabaseForRequest from '@/lib/getUserAndSupabaseForRequest';

function publicUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  name?: string | null;
  picture?: string | null;
  image?: string | null;
}) {
  const metadata = user.user_metadata || {};
  const name =
    metadata.full_name ||
    metadata.name ||
    metadata.display_name ||
    metadata.preferred_username ||
    metadata.given_name ||
    user.name ||
    null;
  const image =
    metadata.avatar_url ||
    metadata.picture ||
    metadata.image ||
    metadata.avatar ||
    user.picture ||
    user.image ||
    null;

  return {
    id: user.id,
    email: user.email ?? null,
    name: typeof name === 'string' ? name : null,
    image: typeof image === 'string' ? image : null,
  };
}

export async function GET(req: Request) {
  try {
    const { user } = await getUserAndSupabaseForRequest(req as any);

    if (!user) {
      return NextResponse.json({ user: null, roles: [], isAdmin: false });
    }

    let roles: string[] = [];
    let isAdmin = false;

    try {
      const { getServerSupabaseClient } = await import('@/lib/serverAuth');
      const svc = getServerSupabaseClient({ useServiceRole: true });
      const profileResult = await svc.from('users').select('role').eq('id', user.id).maybeSingle();

      isAdmin = String(profileResult?.data?.role || '').toUpperCase() === 'ADMIN';
      roles = [isAdmin ? 'ADMIN' : 'USER'];
    } catch {
      roles = ['USER'];
    }

    return NextResponse.json({
      user: publicUser(user),
      roles,
      isAdmin,
    });
  } catch {
    return NextResponse.json({ user: null, roles: [], isAdmin: false });
  }
}

export const dynamic = 'force-dynamic';
