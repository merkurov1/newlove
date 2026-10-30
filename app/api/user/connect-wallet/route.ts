import { NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import {
  normalizeWalletAddress,
  verifyWalletProof,
} from '@/lib/walletProof';

export const dynamic = 'force-dynamic';

/**
 * Links a wallet to the signed-in account.
 *
 * A wallet address on its own is a claim, not a proof. Without a signature
 * any account could attach an eligible wallet and then request its mint
 * voucher through /api/generate-signature.
 */
export async function POST(req: Request) {
  try {
    const { user } = await getUserAndSupabaseForRequest(req);

    if (!user) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const walletAddress = normalizeWalletAddress(body?.wallet_address);

    if (!walletAddress) {
      return NextResponse.json({ error: 'wallet_invalid' }, { status: 400 });
    }

    const proof = verifyWalletProof({
      walletAddress,
      issuedAt: body?.issued_at,
      signature: body?.signature,
    });

    if (!proof.ok) {
      return NextResponse.json(
        { error: 'wallet_not_verified' },
        { status: 403 },
      );
    }

    const svc = getServerSupabaseClient({ useServiceRole: true });

    // A wallet may belong to exactly one account.
    const { data: existing, error: existingError } = await svc
      .from('subscribers')
      .select('id, userId')
      .eq('wallet_address', walletAddress)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error('[connect-wallet] lookup failed', existingError);
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    if (
      existing?.userId &&
      String(existing.userId) !== String(user.id)
    ) {
      return NextResponse.json(
        { error: 'wallet_already_linked' },
        { status: 409 },
      );
    }

    const { error: updateError } = await svc
      .from('subscribers')
      .update({ wallet_address: walletAddress })
      .eq('userId', user.id);

    if (updateError) {
      console.error('[connect-wallet] update failed', updateError);
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, wallet: walletAddress });
  } catch (error) {
    console.error(
      '[connect-wallet]',
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
