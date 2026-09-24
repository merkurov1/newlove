import { NextResponse } from 'next/server';
import createRouteHandlerClient from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

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

    // Инициализируем Supabase клиент для сервера
    const supabase = createRouteHandlerClient({ cookies });

    // Сохраняем запрос в базу (если уже есть — игнорируем ошибку дубликата)
    const { error: dbError } = await supabase
      .from('access_requests')
      .upsert({ email, status: 'pending' }, { onConflict: 'email' });

    if (dbError) {
      console.error('Database error saving access request:', dbError);
    }

    // Отправка уведомления в Telegram
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const text = `📨 <b>New Art Terminal Access Request</b>\n\n<b>Email</b>: ${escapeHtml(email)}\n\n— sent via Art Intelligence Terminal`;

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
      }).catch(err => console.error('Telegram notification failed:', err));
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
