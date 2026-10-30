import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import {
  normalizeWalletAddress,
  verifyWalletProof,
} from '@/lib/walletProof';

export const dynamic = 'force-dynamic';

const SIGNER_KEY = process.env.SIGNER_PRIVATE_KEY || process.env.SIGNER_KEY;
const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS ||
  process.env.NEUTRAL_HEART_ADDRESS;
const CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID || 137,
);

async function signVoucherForAddress(walletAddress: string) {
  if (!SIGNER_KEY) throw new Error('SIGNER_PRIVATE_KEY not configured');
  if (!CONTRACT_ADDRESS) throw new Error('CONTRACT_ADDRESS not configured');

  const wallet = new ethers.Wallet(SIGNER_KEY);
  const digest = ethers.solidityPackedKeccak256(
    ['address', 'uint256', 'address'],
    [CONTRACT_ADDRESS, CHAIN_ID, walletAddress],
  );
  const signature = await wallet.signMessage(ethers.getBytes(digest));

  return signature;
}

/**
 * Issues a voucher signature for the subscriber's wallet.
 *
 * Authorization rules:
 *   * the caller must have a verified session;
 *   * a wallet is trusted when the cookie session already links it to the
 *     caller (service-role lookup by userId), or when the request carries a
 *     fresh signature proving control of that wallet.
 *
 * A wallet address alone is no longer sufficient: previously any signed-in
 * account could request a voucher for someone else's eligible wallet.
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

    const svc = getServerSupabaseClient({ useServiceRole: true });

    const { data: ownRow, error: ownError } = await svc
      .from('subscribers')
      .select('id, wallet_address, has_claimed')
      .eq('userId', user.id)
      .limit(1)
      .maybeSingle();

    if (ownError) {
      console.error('[generate-signature] subscriber lookup failed', ownError);
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    const ownWallet =
      typeof ownRow?.wallet_address === 'string'
        ? ownRow.wallet_address.toLowerCase()
        : null;

    let subscriber = ownWallet === walletAddress ? ownRow : null;

    if (!subscriber) {
      // Wallet-only eligibility requires proof of wallet control.
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
        console.error(
          '[generate-signature] wallet lookup failed',
          walletError,
        );
        return NextResponse.json(
          { error: 'server_error' },
          { status: 500 },
        );
      }

      subscriber = byWallet;
    }

    if (!subscriber) {
      return NextResponse.json({ error: 'not_eligible' }, { status: 403 });
    }

    if (subscriber.has_claimed) {
      return NextResponse.json({ error: 'already_claimed' }, { status: 403 });
    }

    const storedWallet = normalizeWalletAddress(
      subscriber.wallet_address,
    );

    if (!storedWallet || storedWallet !== walletAddress) {
      return NextResponse.json({ error: 'not_eligible' }, { status: 403 });
    }

    const signature = await signVoucherForAddress(walletAddress);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return NextResponse.json({ signature, expires_at: expiresAt });
  } catch (error) {
    console.error(
      '[generate-signature]',
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
