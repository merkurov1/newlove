import { NextRequest, NextResponse } from 'next/server';
// API-роут SIWE-verify очищен. Здесь может быть реализована новая логика, если потребуется.
// 
// 
// 

// Используем сервисный ключ для админ-доступа
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();
    const cookies = req.headers.get('cookie') || '';
    const nonceMatch = cookies.match(/siwe_nonce=([^;]+)/);
    const nonce = nonceMatch ? nonceMatch[1] : null;
    if (!nonce) return NextResponse.json({ error: 'No nonce' }, { status: 400 });

    // Верификация подписи
    const siwe = new SiweMessage(message);
    const result = await siwe.verify({ signature, nonce });
    if (!result.success) return NextResponse.json({ error: 'Invalid SIWE' }, { status: 401 });

    const address = siwe.address.toLowerCase();
    const fakeEmail = `${address}@siwe.example.com`;

    // 1. Найти или создать пользователя в Supabase Auth
    let user = null;
    // Получаем первую страницу пользователей (по умолчанию 100)
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;
    if (usersData && usersData.users && usersData.users.length > 0) {
      user = usersData.users.find((u) => u.email === fakeEmail) || null;
    }
    if (!user) {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: fakeEmail,
        email_confirm: true,
        user_metadata: { wallet: address },
      });
      if (createError) throw createError;
      user = newUser.user;
    }

    // 2. Вернуть user.id как access_token (демо-режим)
    // Для production используйте кастомный JWT или signInWithIdToken
    return NextResponse.json({
      access_token: user.id,
      token_type: 'bearer',
      user,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'SIWE verify failed' }, { status: 401 });
  }
}
