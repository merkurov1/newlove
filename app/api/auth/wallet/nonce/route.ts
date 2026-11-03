import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';

import { getServerSupabaseClient } from '@/lib/serverAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NONCE_TTL_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const limited = checkRateLimit(getClientIp(request), {
    interval: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'wallet-nonce',
  });

  if (limited) return limited;

  const nonce = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();

  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const { error } = await store.from('wallet_auth_nonces').insert({
      nonce,
      expires_at: expiresAt,
    });

    if (error) {
      console.error('[api/auth/wallet/nonce] insert failed');
      return NextResponse.json({ error: 'Wallet sign-in is unavailable.' }, { status: 503 });
    }

    return NextResponse.json(
      { nonce, expiresAt },
      { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } }
    );
  } catch {
    console.error('[api/auth/wallet/nonce] unavailable');
    return NextResponse.json({ error: 'Wallet sign-in is unavailable.' }, { status: 503 });
  }
}
