import { NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import {
  normalizeWalletAddress,
  verifyWalletProof,
} from '@/lib/walletProof';

export const dynamic = 'force-dynamic';

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/**
 * Marks the caller's own subscriber row as claimed after a successful mint.
 *
 * The old implementation updated `subscribers` by an arbitrary `ilike`
 * wallet pattern, which could mark every row as claimed. Updates are now
 * scoped to one row that either belongs to the session or is proven with a
 * wallet signature.
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

    const txHash =
      typeof body?.tx_hash === 'string' &&
      TX_HASH_PATTERN.test(body.tx_hash.trim())
        ? body.tx_hash.trim()
        : null;

    const svc = getServerSupabaseClient({ useServiceRole: true });

    const { data: ownRow, error: ownError } = await svc
      .from('subscribers')
      .select('id, wallet_address, has_claimed')
      .eq('userId', user.id)
      .limit(1)
      .maybeSingle();

    if (ownError) {
      console.error('[mark-claimed] subscriber lookup failed', ownError);
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }

    const ownWallet =
      typeof ownRow?.wallet_address === 'string'
        ? ownRow.wallet_address.toLowerCase()
        : null;

    let subscriber = ownWallet === walletAddress ? ownRow : null;

    if (!subscriber) {
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

      const { data: byWallet, error: walletError } = await svc
        .from('subscribers')
        .select('id, wallet_address, has_claimed')
        .eq('wallet_address', walletAddress)
        .limit(1)
        .maybeSingle();

      if (walletError) {
        console.error('[mark-claimed] wallet lookup failed', walletError);
        return NextResponse.json({ error: 'db_error' }, { status: 500 });
      }

      subscriber = byWallet;
    }

    if (!subscriber) {
      return NextResponse.json(
        { ok: false, updated: false, error: 'not_found' },
        { status: 404 },
      );
    }

    if (subscriber.has_claimed) {
      return NextResponse.json({ ok: true, updated: false, alreadyClaimed: true });
    }

    const { data: updated, error: updateError } = await svc
      .from('subscribers')
      .update({ has_claimed: true })
      .eq('id', subscriber.id)
      .select('id')
      .maybeSingle();

    if (updateError) {
      console.error('[mark-claimed] update failed', updateError);
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }

    if (txHash) {
      console.info('[mark-claimed] claim recorded', {
        subscriberId: subscriber.id,
        txHash,
      });
    }

    return NextResponse.json({ ok: true, updated: Boolean(updated) });
  } catch (error) {
    console.error(
      '[mark-claimed]',
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
