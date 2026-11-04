import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  claimVigilSpark,
  getVigilSparkStatus,
} from '@/lib/vigil/claim';
import { resolveVigilIdentity } from '@/lib/vigil/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function GET(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 60,
    keyPrefix: 'vigil-status',
  });

  if (limited) return limited;

  try {
    const supabaseAdmin = serverClient();

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'server misconfigured' }, { status: 500 });
    }

    const identity = await resolveVigilIdentity(req, supabaseAdmin);

    if (!identity) {
      return NextResponse.json(
        {
          authenticated: false,
          canSpark: false,
          remainingMs: 0,
          remainingLabel: '',
          lastSparkAt: null,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const status = await getVigilSparkStatus(supabaseAdmin, identity);

    return NextResponse.json(
      {
        authenticated: true,
        ...status,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error(
      'Vigil status error:',
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      { error: 'Vigil status unavailable' },
      { status: 503 }
    );
  }
}

export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'vigil-claim',
  });

  if (limited) return limited;

  try {
    const supabaseAdmin = serverClient();

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'server misconfigured' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, intention } = body || {};

    if (id === undefined || id === null) {
      return NextResponse.json({ error: 'missing params' }, { status: 400 });
    }

    const heartId = Number(id);

    if (!Number.isInteger(heartId) || heartId < 1 || heartId > 5) {
      return NextResponse.json({ error: 'invalid heart id' }, { status: 400 });
    }

    if (
      typeof intention === 'string' &&
      intention.length > 280
    ) {
      return NextResponse.json({ error: 'intention too long' }, { status: 400 });
    }

    const identity = await resolveVigilIdentity(
      req,
      supabaseAdmin,
      typeof body?.token === 'string' ? body.token : null
    );

    if (!identity) {
      return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    }

    const result = await claimVigilSpark(
      supabaseAdmin,
      identity,
      heartId,
      typeof intention === 'string' ? intention : null
    );

    if (!result.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(result.remainingMs / 1000)
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'cooldown',
          message: result.remainingLabel
            ? `You can light the heart again in ${result.remainingLabel}.`
            : 'You can light the heart again soon.',
          remainingMs: result.remainingMs,
          remainingLabel: result.remainingLabel,
          lastSparkAt: result.lastSparkAt,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds),
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const { data: record, error: recordError } = await supabaseAdmin
      .from('vigil_hearts')
      .select('*')
      .eq('id', heartId)
      .maybeSingle();

    if (recordError) {
      console.warn('Vigil heart readback failed:', recordError.message);
    }

    return NextResponse.json({
      ok: true,
      record: record ?? null,
      cooldown: {
        remainingMs: 24 * 60 * 60 * 1000,
        remainingLabel: '24h',
        lastSparkAt: result.lastSparkAt,
      },
    });
  } catch (error) {
    console.error(
      'Vigil claim error:',
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      { error: 'The spark could not be transmitted. Please try again.' },
      { status: 503 }
    );
  }
}
