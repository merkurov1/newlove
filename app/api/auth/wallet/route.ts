import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyMessage } from 'ethers';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } }
);

export async function POST(request: Request) {
  try {
    const { address, message, signature } = await request.json();

    if (!address || !message || !signature) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // 1. Проверяем криптографическую подпись
    const recoveredAddress = verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 2. Генерируем детерминированный email и пароль для пользователя кошелька в Supabase
    const walletEmail = `${address.toLowerCase()}@wallet.merkur.io`;
    const walletPassword = `pw_${address}_${process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10)}`;

    let userId: string;

    // Проверяем, существует ли пользователь с таким email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    let user = existingUsers?.users.find((u) => u.email === walletEmail);

    if (!user) {
      // Создаем нового пользователя
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: walletEmail,
        password: walletPassword,
        email_confirm: true,
        user_metadata: { wallet_address: address, role: 'Collector' },
      });
      if (createError) throw createError;
      userId = newUser.user.id;
    } else {
      userId = user.id;
    }

    // 3. Создаем запись в таблице profiles (если настроена)
    await supabaseAdmin.from('profiles').upsert({
      id: userId,
      wallet_address: address,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    // 4. Генерируем сессию через стандартный вход по паролю на стороне сервера
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: walletEmail,
      password: walletPassword,
    });

    if (signInError) throw signInError;

    return NextResponse.json({
      success: true,
      session: signInData.session,
    });
  } catch (err: any) {
    console.error('Wallet auth error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
