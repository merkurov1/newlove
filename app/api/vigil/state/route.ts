import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getVigilPublicState } from '@/lib/vigil/publicState';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * Public, read-only Vigil state for the Temple heart.
 *
 * The count is computed by the server from the private claim table. Only the
 * aggregate count and public flame timestamp leave this route.
 */
export async function GET(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 120,
    keyPrefix: 'vigil-state',
  });

  if (limited) return limited;

  const supabaseAdmin = serverClient();

  if (!supabaseAdmin) {
    console.error('Vigil state: missing server configuration');

    return NextResponse.json(
      { error: 'Vigil state unavailable' },
      { status: 500 }
    );
  }

  try {
    const state = await getVigilPublicState(supabaseAdmin);

    return NextResponse.json(state, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error(
      'Vigil state error:',
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      { error: 'Vigil state unavailable' },
      { status: 503 }
    );
  }
}
