import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, RATE_LIMITS, checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rl = checkRateLimit(clientIp, RATE_LIMITS.NEWSLETTER);
  if (rl) return rl;

  try {
    const body = await req.json();
    const email = (body?.email || '').toString().trim().toLowerCase();
    
    // Получаем переданные из клиента language/locale и userId
    const language = (body?.language || body?.locale || 'ru').toString().trim().toLowerCase();
    const locale = language === 'en' ? 'en' : 'ru';
    const userId = body?.userId || null;

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
    const { supabase } = await getUserAndSupabaseForRequest(req) || {};
    if (!supabase) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

    // Проверяем существующего подписчика
    const { data: existing } = await supabase.from('subscribers').select('*').ilike('email', email).maybeSingle();
    let subscriberId = existing?.id;

    if (!subscriberId) {
      // Создаем нового активного подписчика с учетом локали и userId
      const now = new Date().toISOString();
      const insertData: any = { 
        email, 
        isActive: true, 
        locale: locale,
        confirmedAt: now,
      };
      if (userId) {
        insertData.userId = userId;
      }

      const insert = await supabase.from('subscribers').insert(insertData).select('id').maybeSingle();
      if (insert.error) {
        console.error('Error inserting subscriber', insert.error);
        return NextResponse.json({ error: 'DB insert failed' }, { status: 500 });
      }
      subscriberId = insert.data?.id;
    } else {
      // Если подписчик уже был, реактивируем его и обновляем язык/userId
      await supabase.from('subscribers').update({ 
        isActive: true, 
        locale: locale, 
        confirmedAt: new Date().toISOString(),
        ...(userId ? { userId } : {}) 
      }).eq('id', subscriberId);
    }

    // Generate confirmation token and store
    const crypto = await import('crypto');
    const token = crypto.randomBytes(18).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: tokenErr } = await supabase.from('subscriber_tokens').insert({ subscriber_id: subscriberId, type: 'confirm', token, expires_at: expiresAt });
    if (tokenErr) {
      console.warn('Failed to insert subscriber token', tokenErr);
    }

    // In production we'd send a confirmation email with the token; here we return token for testing
    return NextResponse.json({ success: true, subscriberId, locale, token: process.env.NODE_ENV === 'development' ? token : undefined });
  } catch (e) {
    console.error('Subscribe error', e);
    return NextResponse.json({ error: 'Subscribe failed' }, { status: 500 });
  }
}
