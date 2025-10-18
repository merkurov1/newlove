import { NextResponse } from 'next/server';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const ctx = await getUserAndSupabaseForRequest(req as Request);
    const user = ctx?.user || null;
    if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const walletAddress = (body && body.wallet_address) || null;
    const txHash = (body && body.tx_hash) || null;

    if (!walletAddress) return NextResponse.json({ error: 'wallet_missing' }, { status: 400 });

    const svc = getServerSupabaseClient({ useServiceRole: true });
    // Idempotent update
    const { data, error } = await svc.from('subscribers').update({ has_claimed: true }).ilike('wallet_address', walletAddress).select('id,has_claimed').limit(1);
    if (error) {
      console.error('mark-claimed supabase error', error);
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: data?.length > 0 });
  } catch (e: any) {
    console.error('mark-claimed error', e);
    return NextResponse.json({ error: 'server_error', detail: String(e?.message || e) }, { status: 500 });
  }
}
