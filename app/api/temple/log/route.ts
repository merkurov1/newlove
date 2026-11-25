import { NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { publicTempleTraceMessage } from '@/lib/temple/publicTrace';

export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'temple-log-simple',
  });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { event_type, message } = body || {};
    if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

    const srv = getServerSupabaseClient({ useServiceRole: true });
    const canonicalType = String(event_type || 'nav').toUpperCase();

    // This legacy utility is still public. It must not become a back door for
    // confession or raw Cast text into the public journal.
    const { error } = await srv.from('temple_log').insert({
      event_type: canonicalType,
      message: publicTempleTraceMessage(canonicalType, String(message)),
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('service insert error', error);
      return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
    }

    return NextResponse.json({ status: 'ok' }, { status: 201 });
  } catch (e: any) {
    console.error('api error', e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
