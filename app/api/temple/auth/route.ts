import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Инициализируем "Админского" клиента
// ВАЖНО: Убедись, что SUPABASE_SERVICE_ROLE_KEY есть в .env.local
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, username, first_name, language_code } = body;

    if (!id) {
      return NextResponse.json({ error: 'No ID provided' }, { status: 400 });
    }

    console.log('🔹 API Temple Auth:', id, username);

    // "Божественная" запись в базу (игнорирует RLS)
    const { error } = await supabaseAdmin
      .from('temple_users')
      .upsert({
        telegram_id: id,
        username: username || '',
        first_name: first_name || '',
        // language_code: language_code || 'en', // раскомментируй, если добавил колонку в SQL
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'telegram_id' });

    if (error) {
      console.error('❌ Supabase Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (e) {
    console.error('❌ Server Error:', e);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}