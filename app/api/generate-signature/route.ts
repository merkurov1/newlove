import { NextResponse } from 'next/server';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { ethers } from 'ethers';

export const dynamic = 'force-dynamic';

const SIGNER_KEY = process.env.SIGNER_PRIVATE_KEY || process.env.SIGNER_KEY;
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS || process.env.NEUTRAL_HEART_ADDRESS;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID || 137);

async function signVoucherForAddress(walletAddress: string) {
  if (!SIGNER_KEY) throw new Error('SIGNER_PRIVATE_KEY not configured');
  if (!CONTRACT_ADDRESS) throw new Error('CONTRACT_ADDRESS not configured');

  const wallet = new ethers.Wallet(SIGNER_KEY);
  // Use ethers v6 packing helper
  const digest = ethers.solidityPackedKeccak256(['address', 'uint256', 'address'], [CONTRACT_ADDRESS, CHAIN_ID, walletAddress]);
  const signature = await wallet.signMessage(ethers.getBytes(digest));
  return signature;
}

export async function POST(req: Request) {
  try {
    const ctx = await getUserAndSupabaseForRequest(req as Request);
    const user = ctx?.user || null;
    if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    // Prefer using the logged-in user's linked wallet if available. Allow explicit wallet_address if provided and matches user metadata.
    const candidateWallet = (body && body.wallet_address) || null;

    // Use service role client to read subscribers table reliably
    const svc = getServerSupabaseClient({ useServiceRole: true });

    // Try to find subscriber row by userId first
    let subRow: any = null;
    try {
      const byUser = await svc.from('subscribers').select('wallet_address,has_claimed').eq('userId', user.id).limit(1).maybeSingle();
      if (!byUser.error && byUser.data) subRow = byUser.data;
    } catch (e) {
      // ignore
    }

    // If no row by userId, and candidateWallet provided, lookup by wallet_address
    if (!subRow && candidateWallet) {
      const byWallet = await svc.from('subscribers').select('wallet_address,has_claimed').ilike('wallet_address', candidateWallet).limit(1).maybeSingle();
      if (!byWallet.error && byWallet.data) subRow = byWallet.data;
    }

    // If still no subscriber row, treat as not eligible
    if (!subRow) return NextResponse.json({ error: 'not_eligible' }, { status: 403 });

    if (subRow.has_claimed) return NextResponse.json({ error: 'already_claimed' }, { status: 403 });

    const walletAddress = (subRow.wallet_address || candidateWallet || '').toLowerCase();
    if (!walletAddress) return NextResponse.json({ error: 'wallet_missing' }, { status: 400 });

    // Sign voucher and return
    const signature = await signVoucherForAddress(walletAddress);
    // short expiry (15 minutes)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return NextResponse.json({ signature, expires_at: expiresAt });
  } catch (e: any) {
    console.error('generate-signature error', e);
    return NextResponse.json({ error: 'server_error', detail: String(e?.message || e) }, { status: 500 });
  }
}
