export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rateLimit';

export async function GET(req: NextRequest) {
  // Rate limiting: 5 requests per 15 minutes per IP
  const clientIp = getClientIp(req);
  const rateLimitResponse = checkRateLimit(clientIp, RATE_LIMITS.NEWSLETTER);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Нет токена подтверждения.' }, { status: 400 });
  }
  try {
  const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
  const { supabase } = await getUserAndSupabaseForRequest((globalThis && (globalThis as any).request) || new Request('http://localhost')) || {};
    if (!supabase) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
    const { data: tokenRow, error: tokenErr } = await supabase.from('subscriber_tokens').select('*').eq('token', token).maybeSingle();
    if (tokenErr) {
      console.error('Error fetching token', tokenErr);
      return NextResponse.json({ error: 'Ошибка подтверждения.' }, { status: 500 });
    }
    // Check if token is valid, unused, and not expired
    if (!tokenRow || tokenRow.type !== 'confirm' || tokenRow.used) {
      return NextResponse.json({ error: 'Некорректный или устаревший токен.' }, { status: 404 });
    }

    // Check token expiry (7 days)
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Токен истёк. Пожалуйста, подпишитесь заново.' }, { status: 410 });
    }
    // Помечаем токен использованным
    await supabase.from('subscriber_tokens').update({ used: true, usedAt: new Date().toISOString() }).eq('token', token);
    // Активируем подписчика (double opt-in confirmed)
    try {
      await supabase.from('subscribers').update({ isActive: true, confirmedAt: new Date().toISOString() }).eq('id', tokenRow.subscriber_id || tokenRow.subscriberId);
    } catch (e) {
      console.warn('Failed to mark subscriber active after confirm:', String(e));
    }
    return NextResponse.json({ message: 'Подписка успешно подтверждена!' });
  } catch (error) {
    return NextResponse.json({ error: 'Ошибка подтверждения.' }, { status: 500 });
  }
}
