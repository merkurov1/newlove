import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyMessage } from 'ethers';
import { normalizeWalletLoginAddress, validateWalletLoginMessage } from '@/lib/auth/walletMessage';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } }
);

function requestHost(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-host');
  const host = forwarded?.split(',')[0]?.trim() || request.headers.get('host');
  if (host) return host;

  try {
    return new URL(request.url).host;
  } catch {
    return '';
  }
}

function requestOrigin(request: Request): string {
  const host = requestHost(request);
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol =
    forwardedProto ||
    (() => {
      try {
        return new URL(request.url).protocol.replace(':', '');
      } catch {
        return 'https';
      }
    })();

  return `${protocol}://${host}`;
}

/**
 * Wallet login compatibility endpoint.
 *
 * The old implementation derived a permanent password from the service-role
 * secret. That made every wallet account recoverable by anyone who learned the
 * secret. It now uses a fresh random server-only password per login and checks
 * the signed message domain and freshness before issuing a session.
 *
 * The nonce is issued by /api/auth/wallet/nonce and consumed atomically here,
 * so a captured message cannot be replayed.
 */
export async function POST(request: Request) {
  try {
    const { address, message, signature } = await request.json();

    if (
      typeof address !== 'string' ||
      typeof message !== 'string' ||
      typeof signature !== 'string'
    ) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const normalizedAddress = normalizeWalletLoginAddress(address);
    if (!normalizedAddress) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const parsed = validateWalletLoginMessage({
      message,
      address: normalizedAddress,
      host: requestHost(request),
      origin: requestOrigin(request),
      chainId: '1',
    });

    if (!parsed) {
      return NextResponse.json({ error: 'Invalid or expired sign-in message' }, { status: 401 });
    }

    const recoveredAddress = verifyMessage(message, signature).toLowerCase();
    if (recoveredAddress !== normalizedAddress) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Atomic single-use check. A nonce can be consumed only once, only before
    // expiry, and only for the same wallet address.
    const now = new Date();
    const { data: consumed, error: nonceError } = await supabaseAdmin
      .from('wallet_auth_nonces')
      .update({ used_at: now.toISOString(), wallet_address: normalizedAddress })
      .eq('nonce', parsed.nonce)
      .is('used_at', null)
      .gt('expires_at', now.toISOString())
      .select('id')
      .maybeSingle();

    if (nonceError) throw nonceError;
    if (!consumed) {
      return NextResponse.json({ error: 'Nonce already used or expired' }, { status: 401 });
    }

    const walletEmail = `${normalizedAddress}@wallet.merkur.io`;
    const walletPassword = randomBytes(32).toString('base64url');

    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) throw listError;

    let user = listData?.users?.find((candidate) => candidate.email?.toLowerCase() === walletEmail);

    if (!user) {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: walletEmail,
        password: walletPassword,
        email_confirm: true,
        user_metadata: { wallet_address: normalizedAddress },
      });

      if (createError || !created?.user) throw createError ?? new Error('create_failed');
      user = created.user;
    } else {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: walletPassword,
      });

      if (updateError) throw updateError;
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: user.id,
        wallet_address: normalizedAddress,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (profileError) throw profileError;

    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: walletEmail,
      password: walletPassword,
    });

    if (signInError || !signInData.session) throw signInError ?? new Error('sign_in_failed');

    return NextResponse.json({
      success: true,
      session: signInData.session,
    });
  } catch {
    console.error('[api/auth/wallet] authentication failed');
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
