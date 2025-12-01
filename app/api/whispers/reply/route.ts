import { NextResponse } from 'next/server';

// Accept { whisperId, message } and send message to the original user via bot
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { whisperId, message } = body;
    if (!whisperId || !message) return NextResponse.json({ ok: false, error: 'missing' }, { status: 400 });

    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });

    const { data: whisper } = await supabase.from('whispers').select('*').eq('id', whisperId).single();
    if (!whisper) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) return NextResponse.json({ ok: false, error: 'bot token missing' }, { status: 500 });

    // try to send message to user via bot
    const sendUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const chatId = whisper.telegram_user_id;
    if (!chatId) return NextResponse.json({ ok: false, error: 'no chat id' }, { status: 400 });

    await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });

    // update DB
    await supabase.from('whispers').update({ my_response: message, status: 'answered' }).eq('id', whisperId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('reply error', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
