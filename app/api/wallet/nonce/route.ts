// /app/api/wallet/nonce/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabase, getUserByWallet, updateNonce } from '@/lib/wallet/supabase-wallet';

const NONCE_TTL_MINUTES = 10;

export async function POST(req: NextRequest) {
  try {
    const { wallet_address } = await req.json();
    if (!wallet_address) return NextResponse.json({ error: 'Не указан адрес кошелька' }, { status: 400 });

    // Генерируем nonce
    const nonce = randomBytes(16).toString('hex');
    const expires_at = new Date(Date.now() + NONCE_TTL_MINUTES * 60 * 1000).toISOString();

    // Находим или создаём пользователя
    let user = await getUserByWallet(wallet_address);
    if (!user) {
      const { data, error } = await supabase
        .from('User')
        .insert({ wallet_address, auth_type: 'wallet', nonce, nonce_expires_at: expires_at })
        .select()
        .single();
      if (error || !data) throw error;
      user = data;
    } else {
      await updateNonce(user.id, nonce, expires_at);
    }

    return NextResponse.json({ nonce, expires_at });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Ошибка генерации nonce' }, { status: 500 });
  }
}
