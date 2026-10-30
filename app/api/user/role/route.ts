import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCurrentUser, getServerSupabaseClient } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

type SupabaseAuthUser = { id: string; email?: string | null };

/**
 * Resolve the caller's role for UI gating.
 *
 * The previous implementation decoded the JWT payload without verifying its
 * signature and then queried the service-role role tables with that `sub`.
 * A forged token could therefore impersonate any user id. It also returned
 * the raw cookie header in the response.
 *
 * Identity is now verified by Supabase Auth (bearer) or by the cookie
 * session, and only the resolved role is returned.
 */
async function userFromBearer(token: string): Promise<SupabaseAuthUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

  if (!url || !anonKey) return null;

  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await client.auth.getUser(token);

  if (error || !data.user) return null;

  return { id: data.user.id, email: data.user.email };
}

async function resolveRole(userId: string): Promise<'ADMIN' | 'USER'> {
  const svc = getServerSupabaseClient({ useServiceRole: true });

  const { data: profile } = await svc
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (String(profile?.role || '').toUpperCase() === 'ADMIN') {
    return 'ADMIN';
  }

  const { data: assignments } = await svc
    .from('user_roles')
    .select('role_id, roles(name)')
    .eq('user_id', userId);

  if (Array.isArray(assignments)) {
    const hasAdmin = assignments.some((row: any) => {
      const related: any = row?.roles;

      if (Array.isArray(related)) {
        return related.some(
          (role: any) => String(role?.name || '').toUpperCase() === 'ADMIN',
        );
      }

      return String(related?.name || '').toUpperCase() === 'ADMIN';
    });

    if (hasAdmin) return 'ADMIN';
  }

  return 'USER';
}

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get('authorization');
    const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

    let user: SupabaseAuthUser | null = null;

    if (bearer) {
      user = await userFromBearer(bearer);
    } else {
      const current = await getCurrentUser();
      user = current ? { id: current.id, email: current.email } : null;
    }

    if (!user) {
      return NextResponse.json({ role: 'ANON' }, { status: 200 });
    }

    const role = await resolveRole(user.id);

    return NextResponse.json(
      { role },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      '[api/user/role] role lookup failed',
      error instanceof Error ? error.message : error,
    );

    return NextResponse.json({ role: 'ANON' }, { status: 200 });
  }
}
