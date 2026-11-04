import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Public Tribute summary.
 *
 * Only `succeeded` rows contribute. Neither donor messages, emails, nor provider
 * identifiers ever leave this route. Moving the read here also removes the
 * browser's dependency on a public SELECT policy for the private `tributes`
 * table.
 */
export async function GET(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 120,
    keyPrefix: 'tribute-summary',
  });

  if (limited) return limited;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Tribute summary: missing server configuration');
    return NextResponse.json(
      { error: 'Tribute summary unavailable' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();

  const { data, error } = await supabase
    .from('tributes')
    .select('amount_cents')
    .eq('status', 'succeeded')
    .gte('created_at', since);

  if (error) {
    console.error('Tribute summary error:', error.message);

    return NextResponse.json(
      { error: 'Tribute summary unavailable' },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as Array<{ amount_cents: number | null }>;
  const totalCents = rows.reduce((sum, row) => {
    const cents = Number(row.amount_cents || 0);

    return Number.isFinite(cents) && cents > 0 ? sum + Math.round(cents) : sum;
  }, 0);

  return NextResponse.json(
    {
      totalCents,
      total: totalCents / 100,
      count: rows.length,
      currency: 'usd',
      since,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
