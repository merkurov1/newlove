import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import {
  normalizePierrotUnframedRef,
  pierrotConversationIdFromUnframedRef,
} from '@/lib/pierrot/orderAttribution';
import { recordPierrotEventByConversationId } from '@/lib/pierrot/serverStore';

export const dynamic = 'force-dynamic';

type Payload = {
  form?: Record<string, unknown>;
  pierrotAttribution?: unknown;
  requestId?: unknown;
};

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export async function POST(request: Request) {
  const limited = checkRateLimit(getClientIp(request), {
    interval: 60 * 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'unframed-proposal',
  });
  if (limited) return limited;

  try {
    const body: Payload = await request.json();
    const form = body.form || {};
    const name = String(form.name ?? '')
      .trim()
      .slice(0, 100);
    const agency = String(form.agency ?? '')
      .trim()
      .slice(0, 150);
    const email = String(form.email ?? '')
      .trim()
      .toLowerCase()
      .slice(0, 254);

    if (!name || !agency || !EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: 'Invalid proposal details.' }, { status: 400 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return NextResponse.json(
        { error: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID' },
        { status: 500 }
      );
    }

    // Existing publisher/proposal notification. Keep the same destination and
    // fields; only validate and truncate before sending.
    const lines: string[] = [];
    lines.push('*New Unframed submission*');
    for (const [key, value] of Object.entries({ name, agency, email })) {
      const safe = String(value ?? '')
        .slice(0, 1000)
        .replace(/`/g, "'");
      lines.push(`*${escapeMarkdown(key)}:* ${escapeMarkdown(safe)}`);
    }
    const text = lines.join('\n');

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = { chat_id: chatId, text, parse_mode: 'Markdown' };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data },
        { status: typeof res.status === 'number' && res.status >= 400 ? res.status : 502 }
      );
    }

    const pierrotRef = normalizePierrotUnframedRef(body.pierrotAttribution);
    const conversationId = pierrotConversationIdFromUnframedRef(pierrotRef);

    if (conversationId) {
      const requestKey = REQUEST_ID_PATTERN.test(String(body.requestId || ''))
        ? String(body.requestId)
        : randomUUID();

      try {
        const store = getServerSupabaseClient({ useServiceRole: true });
        await recordPierrotEventByConversationId(store, {
          conversationId,
          eventName: 'unframed_request_submitted',
          eventKey: `unframed_request_submitted:${requestKey}`,
          payload: { offer_id: 'unframed', source: 'publisher_form' },
        });
      } catch {
        // Analytics is best-effort; the proposal has already been delivered.
      }
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

function escapeMarkdown(s: string) {
  return s.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, (m) => `\\${m}`);
}
