import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, RATE_LIMITS, checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rl = checkRateLimit(clientIp, RATE_LIMITS.NEWSLETTER);
  if (rl) return rl;

  try {
    const body = await req.json();
    const email = (body?.email || '').toString().trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
    const { supabase } = await getUserAndSupabaseForRequest((globalThis && (globalThis as any).request) || new Request('http://localhost')) || {};
    if (!supabase) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

    // Upsert subscriber (create if not exists). New subscribers are inactive until confirmed.
    const { data: existing } = await supabase.from('subscribers').select('*').ilike('email', email).maybeSingle();
    let subscriberId = existing?.id;
    if (!subscriberId) {
      const insert = await supabase.from('subscribers').insert({ email, isActive: false }).select('id').maybeSingle();
      if (insert.error) {
        console.error('Error inserting subscriber', insert.error);
        return NextResponse.json({ error: 'DB insert failed' }, { status: 500 });
      }
      subscriberId = insert.data?.id;
    }

    // Generate confirmation token and store
    const crypto = await import('crypto');
    const token = crypto.randomBytes(18).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: tokenErr } = await supabase.from('subscriber_tokens').insert({ subscriber_id: subscriberId, type: 'confirm', token, expires_at: expiresAt });
    if (tokenErr) {
      console.warn('Failed to insert subscriber token', tokenErr);
    }

    // In production we'd send a confirmation email with the token; here we return token for testing
    return NextResponse.json({ success: true, subscriberId, token: process.env.NODE_ENV === 'development' ? token : undefined });
  } catch (e) {
    console.error('Subscribe error', e);
    return NextResponse.json({ error: 'Subscribe failed' }, { status: 500 });
  }
}
