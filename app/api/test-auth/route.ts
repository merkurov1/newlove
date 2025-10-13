import { NextResponse } from 'next/server';
import { getUserAndSupabaseFromRequest } from '@/lib/supabase-server';

// Debug endpoint: returns lightweight info about the current user (if any)
// and whether a Supabase server client could be created from the request.
export async function GET(req: Request) {
  try {
    const { user, supabase } = await getUserAndSupabaseFromRequest(req as Request);
    const safeUser = user
      ? { id: user.id, email: user.email, role: user.user_metadata?.role || user.role || 'USER' }
      : null;
    return NextResponse.json({ ok: true, user: safeUser, hasSupabaseClient: !!supabase });
  } catch (err: any) {
    console.error('test-auth error', err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
