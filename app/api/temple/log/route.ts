import { NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

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
    const { error } = await srv.from('temple_log').insert({
      event_type: event_type || 'nav',
      message: message,
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
