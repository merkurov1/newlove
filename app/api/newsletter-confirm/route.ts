export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getUserAndSupabaseFromRequest } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Нет токена подтверждения.' }, { status: 400 });
  }
  try {
    const { supabase } = await getUserAndSupabaseFromRequest((globalThis && (globalThis as any).request) || new Request('http://localhost')) || {};
    if (!supabase) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
    const { data: tokenRow, error: tokenErr } = await supabase.from('subscriber_tokens').select('*').eq('token', token).maybeSingle();
    if (tokenErr) {
      console.error('Error fetching token', tokenErr);
      return NextResponse.json({ error: 'Ошибка подтверждения.' }, { status: 500 });
    }
    if (!tokenRow || tokenRow.type !== 'confirm' || tokenRow.used) {
      return NextResponse.json({ error: 'Некорректный или устаревший токен.' }, { status: 404 });
    }
    // Помечаем токен использованным
    await supabase.from('subscriber_tokens').update({ used: true }).eq('token', token);
    return NextResponse.json({ message: 'Подписка успешно подтверждена!' });
  } catch (error) {
    return NextResponse.json({ error: 'Ошибка подтверждения.' }, { status: 500 });
  }
}
