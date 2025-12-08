import { NextResponse } from 'next/server';

type Payload = {
  form?: Record<string, any>;
};

export async function POST(request: Request) {
  try {
    const body: Payload = await request.json();
    const form = body.form || {};

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return NextResponse.json({ error: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID' }, { status: 500 });
    }

    // Build a readable message
    const lines: string[] = [];
    lines.push('*New Unframed submission*');
    for (const [k, v] of Object.entries(form)) {
      // sanitize and truncate long values
      const safe = String(v ?? '').slice(0, 1000).replace(/`/g, "'");
      lines.push(`*${escapeMarkdown(String(k))}:* ${escapeMarkdown(safe)}`);
    }
    const text = lines.join('\n');

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = { chat_id: chatId, text, parse_mode: 'Markdown' };

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data }, { status: res.status });
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

function escapeMarkdown(s: string) {
  // Minimal MarkdownV2 escape for Telegram
  return s.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, (m) => `\\${m}`);
}
