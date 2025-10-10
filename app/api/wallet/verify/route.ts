// /app/api/wallet/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySiweMessage } from '@/lib/wallet/siwe';
import { supabase, getUserByWallet, createOrUpdateWalletUser } from '@/lib/wallet/supabase-wallet';
import type { SiweVerifyRequest } from '@/types/wallet';

export async function POST(req: NextRequest) {
  try {
    const { message, signature, chain }: SiweVerifyRequest = await req.json();
    if (!message || !signature || !chain) return NextResponse.json({ error: 'Некорректные параметры' }, { status: 400 });

    // Получаем адрес из SIWE сообщения (без верификации)
    const tempSiwe = JSON.parse(message);
    const address = tempSiwe.address?.toLowerCase();
    if (!address) return NextResponse.json({ error: 'Не удалось извлечь адрес из сообщения' }, { status: 400 });

    let user = await getUserByWallet(address);
    if (!user) {
      user = await createOrUpdateWalletUser(address, chain);
    }
    if (!user.nonce) return NextResponse.json({ error: 'Nonce не найден' }, { status: 400 });

    // Верификация SIWE
    const { data: siwe, success } = await verifySiweMessage({ message, signature, nonce: user.nonce });
    if (!success) return NextResponse.json({ error: 'Неверная подпись' }, { status: 401 });

    // TODO: проверить срок действия nonce, обновить сессию

    // Здесь создаём Supabase-сессию (можно использовать JWT или Supabase Auth API)
    // Для MVP возвращаем user
    return NextResponse.json({ user });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Ошибка верификации SIWE' }, { status: 500 });
  }
}
