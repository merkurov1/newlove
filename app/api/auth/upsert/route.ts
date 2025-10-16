import { NextResponse } from 'next/server';
import getUserAndSupabaseForRequest from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient } from '@/lib/serverAuth';

// Secure upsert: derive authenticated user from the incoming Request (cookies)
// and upsert an application-level row in public.users using the service role key.
export async function POST(req: Request) {
  try {
    // Derive user from request (reads cookies / Authorization header)
    const { user } = await getUserAndSupabaseForRequest(req as any);
    if (!user || !user.id) {
      return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    }

    // The client may optionally send name/email/image (best-effort) but we
    // prefer authoritative values from the auth.user object returned by
    // Supabase; fall back to provided fields only if present.
    const body = await req.json().catch(() => ({}));
    const email = (user.email) || body?.email || null;
    const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || user.name || body?.name || null;
    const image = (user.user_metadata && (user.user_metadata.avatar_url || user.user_metadata.picture || user.user_metadata.image)) || (user as any).picture || (user as any).image || body?.image || null;

    const svc = getServerSupabaseClient({ useServiceRole: true });
    const payload: any = { id: user.id };
    if (email !== null) payload.email = email;
    if (name !== null) payload.name = name;
    if (image !== null) payload.image = image;

    const { data, error } = await svc.from('users').upsert(payload, { onConflict: 'id' }).select().maybeSingle();
    if (error) {
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
