import { NextResponse } from 'next/server';

type Body = {
  name?: string;
  agency?: string;
  email?: string;
};

export async function POST(request: Request) {
  try {
    const body: Body = await request.json();
    const { name = 'unknown', agency = 'unknown', email = 'unknown' } = body;

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return NextResponse.json({ ok: false, error: 'telegram-not-configured' }, { status: 500 });
    }

    const text = `📨 New UNFRAMED request\n\n<b>Agent</b>: ${escapeHtml(name)}\n<b>Agency</b>: ${escapeHtml(agency)}\n<b>Email</b>: ${escapeHtml(email)}\n\n— sent via merkurov.love/unframed`;

    const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => 'no body');
      return NextResponse.json({ ok: false, error: 'telegram-failed', detail: txt }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: 'server' }, { status: 500 });
  }
}

function escapeHtml(s: string) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
