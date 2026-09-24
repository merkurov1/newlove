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

    // Проверяем переменные Supabase Service Role для обхода RLS у неавторизованных пользователей
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase Service Role configuration');
      return NextResponse.json({ ok: false, error: 'server-config-error' }, { status: 500 });
    }

    // Создаем клиент с правами администратора (Service Role)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // Сохраняем запрос в базу
    const { error: dbError } = await supabase
      .from('access_requests')
      .upsert({ email, status: 'pending' }, { onConflict: 'email' });

    if (dbError) {
      console.error('Database error saving access request:', dbError);
      return NextResponse.json({ ok: false, error: 'database-error', details: dbError.message }, { status: 500 });
    }

    // Отправка уведомления в Telegram
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const text = `📨 <b>New Art Terminal Access Request</b>\n\n<b>Email</b>: ${escapeHtml(email)}\n\n— sent via Art Intelligence Terminal`;

      const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
      });

      if (!tgRes.ok) {
        const tgError = await tgRes.json();
        console.error('Telegram notification failed:', tgError);
      }
    } else {
      console.warn('Telegram credentials (BOT_TOKEN or CHAT_ID) are missing');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Request access error:', err);
    return NextResponse.json({ ok: false, error: 'server-error' }, { status: 500 });
  }
}

function escapeHtml(s: string) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
