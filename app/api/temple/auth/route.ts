import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Важно для Vercel

export async function POST(req: Request) {
  // Проверка наличия сервисного ключа
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sbUrl || !sbServiceKey) {
    console.error('SERVER ERROR: Missing SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  const supabaseAdmin = createClient(sbUrl, sbServiceKey, {
    auth: {
      persistSession: false // Важно для серверного клиента
    }
  });

  try {
    const body = await req.json();
    const { id, username, first_name } = body;

    if (!id) return NextResponse.json({ error: 'No ID' }, { status: 400 });

    // Запись в базу с правами админа (игнорирует RLS)
    const { error } = await supabaseAdmin
      .from('temple_users')
      .upsert({
        telegram_id: id,
        username: username || '',
        first_name: first_name || 'Anon',
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'telegram_id' });

    if (error) {
      console.error('Supabase Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('API Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}