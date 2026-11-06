import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { requireAdminFromRequest } from '@/lib/serverAuth';

// Accept { whisperId, message } and send message to the original user via bot.
// This is an owner-only moderation action.
export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'whispers-reply',
  });
  if (limited) return limited;

  try {
    try {
      await requireAdminFromRequest(req);
    } catch {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    // Support both JSON and form-encoded submissions (HTML forms send x-www-form-urlencoded)
    let whisperId: string | null = null;
    let message: string | null = null;
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json();
      whisperId = body.whisperId || body.whisper_id || null;
      message = body.message || null;
    } else {
      const text = await req.text();
      const params = new URLSearchParams(text);
      whisperId = params.get('whisperId') || params.get('whisper_id');
      message = params.get('message');
    }
    if (!whisperId || !message)
      return NextResponse.json({ ok: false, error: 'missing' }, { status: 400 });
    if (typeof whisperId !== 'string' || typeof message !== 'string' || message.length > 2_000) {
      return NextResponse.json({ ok: false, error: 'invalid input' }, { status: 400 });
    }

    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });

    const { data: whisper } = await supabase
      .from('whispers')
      .select('*')
      .eq('id', whisperId)
      .single();
    if (!whisper) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

    // Prefer PIERROT_BOT_TOKEN (new bot); fall back to legacy TELEGRAM_BOT_TOKEN
    const BOT_TOKEN = process.env.PIERROT_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN)
      return NextResponse.json(
        { ok: false, error: 'bot token missing (set PIERROT_BOT_TOKEN or TELEGRAM_BOT_TOKEN)' },
        { status: 500 }
      );

    // try to send message to user via bot
    const sendUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const chatId = whisper.telegram_user_id;
    if (!chatId) return NextResponse.json({ ok: false, error: 'no chat id' }, { status: 400 });

    const telegramResponse = await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    if (!telegramResponse.ok) {
      console.error('[whispers] Telegram reply failed:', telegramResponse.status);
      return NextResponse.json({ ok: false, error: 'Delivery failed' }, { status: 502 });
    }

    // update DB
    await supabase
      .from('whispers')
      .update({ my_response: message, status: 'answered' })
      .eq('id', whisperId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('reply error', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ ok: false, error: 'Reply failed' }, { status: 500 });
  }
}
