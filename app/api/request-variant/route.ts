import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { wallet_address, variant, tx_hash } = body || {};

    // Simple safety: do not proceed if no service key is set
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_KEY) {
      return NextResponse.json({ ok: false, reason: 'server_not_configured' }, { status: 503 });
    }

    // TODO: implement real reservation logic using Supabase and an off-chain signer
    // For now, return a placeholder response indicating we would process the request.
    return NextResponse.json({ ok: true, message: 'reserved (stub)', variant, wallet_address });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
