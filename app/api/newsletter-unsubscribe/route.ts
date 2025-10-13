export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getUserAndSupabaseFromRequest } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Нет токена для отписки.' }, { status: 400 });
  }
  try {
    const { supabase } = await getUserAndSupabaseFromRequest((globalThis && (globalThis as any).request) || new Request('http://localhost')) || {};
    if (!supabase) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
    const { data: tokenRow, error: tokenErr } = await supabase.from('subscriber_tokens').select('*').eq('token', token).maybeSingle();
    if (tokenErr) {
      console.error('Error fetching token', tokenErr);
      return NextResponse.json({ error: 'Ошибка при отписке.' }, { status: 500 });
    }
    if (!tokenRow || tokenRow.type !== 'unsubscribe' || tokenRow.used) {
      return NextResponse.json({ error: 'Некорректный или устаревший токен.' }, { status: 404 });
    }
    // Помечаем токен использованным
    await supabase.from('subscriber_tokens').update({ used: true }).eq('token', token);
    // Удаляем подписчика (или soft-delete)
    await supabase.from('subscribers').delete().eq('id', tokenRow.subscriber_id || tokenRow.subscriberId);
    return NextResponse.json({ message: 'Вы успешно отписались от рассылки.' });
  } catch (error) {
    return NextResponse.json({ error: 'Ошибка при отписке.' }, { status: 500 });
  }
}
