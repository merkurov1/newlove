import { NextResponse } from 'next/server';
import getUserAndSupabaseForRequest from '@/lib/getUserAndSupabaseForRequest';

export async function GET(req: Request) {
  try {
    const headersObj: Record<string, string | null> = {};
    for (const [k, v] of Array.from(req.headers.entries())) {
      // Hide long secrets
      headersObj[k] = (typeof v === 'string' && v.length > 200) ? `${v.slice(0, 80)}...` : v;
    }

    const cookieHeader = (req as any).headers?.get?.('cookie') || null;
    const { supabase, user, isServer } = await getUserAndSupabaseForRequest(req as any);

    return NextResponse.json({ ok: true, headers: headersObj, cookie: Boolean(cookieHeader), hasSupabaseClient: Boolean(supabase), user: user ? { id: user.id, email: user.email, role: user.role || user.user_metadata?.role || null } : null, isServer: Boolean(isServer) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}

export const dynamic = 'force-dynamic';
