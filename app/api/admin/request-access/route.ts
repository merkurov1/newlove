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

    // 1. Пробуем сделать Insert вместо upsert, чтобы точно поймать ошибку структуры
    const { data, error: dbError } = await supabase
      .from('access_requests')
      .insert([{ email, status: 'pending' }])
      .select();

    if (dbError) {
      console.error('CRITICAL DB ERROR:', dbError);
      // Если email уже есть, upsert/insert выдает ошибку дубликата (обычно код 23505), 
      // но если таблица пустая — тут видна реальная проблема (например, не найдена таблица)
      if (dbError.code !== '23505') {
        return NextResponse.json({ ok: false, error: `DB Error: ${dbError.message} (Code: ${dbError.code})` }, { status: 500 });
      }
    }

    // 2. Отправка в Telegram с логированием ответа
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
        return NextResponse.json({ ok: false, error: `Telegram Error: ${tgData.description || 'Unknown'}` }, { status: 500 });
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
