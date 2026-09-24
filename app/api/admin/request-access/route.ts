import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Body = {
  email?: string;
};

export async function POST(request: Request) {
  try {
    const body: Body = await request.json();
    const email = body.email?.trim();

    if (!email) {
      return NextResponse.json({ ok: false, error: 'email-required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ ok: false, error: 'Missing Server Environment Variables' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // 1. Сохранение в базу access_requests
    const { error: dbError } = await supabase
      .from('access_requests')
      .insert([{ email, status: 'pending' }]);

    if (dbError) {
      console.error('CRITICAL DB ERROR:', dbError);
      // Если email уже запрошен (дубликат), не падаем с 500 ошибкой, а говорим пользователю
      if (dbError.code === '23505') {
        return NextResponse.json({ ok: false, error: 'This email has already requested access.' }, { status: 400 });
      }
      return NextResponse.json({ ok: false, error: `DB Error: ${dbError.message} (Code: ${dbError.code})` }, { status: 500 });
    }

    // 2. Отправка уведомления в Telegram
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const text = `📨 <b>New Art Terminal Access Request</b>\n\n<b>Email</b>: ${escapeHtml(email)}\n\n— sent via Art Intelligence Terminal`;

      const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
      });

      const tgData = await tgRes.json();
      if (!tgRes.ok) {
        console.error('TELEGRAM API ERROR:', tgData);
      }
    } else {
      console.warn('Telegram tokens are not defined in environment variables');
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Unhandled request-access error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'server-error' }, { status: 500 });
  }
}

function escapeHtml(s: string) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
