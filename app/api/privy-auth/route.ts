import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from 'privy';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

export async function POST(req: NextRequest) {
  const { authToken } = await req.json();

  // 1. Инициализация Privy Admin SDK
  const privy = new PrivyClient(
    process.env.PRIVY_APP_ID!,
    process.env.PRIVY_APP_SECRET!
  );

  // 2. Верификация токена
  const claims = await privy.verifyAuthToken(authToken);
  if (!claims?.userId) {
    return NextResponse.json({ error: 'Invalid Privy token' }, { status: 401 });
  }

  // 3. Получаем данные пользователя Privy
  const privyUser = await privy.users.getUser(claims.userId);
  const wallet = privyUser.wallet?.address?.toLowerCase();
  const email = privyUser.email?.address?.toLowerCase() || null;
  const privyDid = privyUser.id;

  // 4. Инициализация Supabase Admin Client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 5. Поиск пользователя по email
  let { data: userByEmail } = email
    ? await supabase
        .from('auth.users')
        .select('*')
        .eq('email', email)
        .maybeSingle()
    : { data: null };

  // 6. Поиск по кошельку (в user_metadata)
  let user = userByEmail;
  if (!user && wallet) {
    const { data: usersByWallet } = await supabase
      .from('auth.users')
      .select('*')
      .contains('raw_user_meta_data', { wallet });
    user = usersByWallet?.[0] || null;
  }

  // 7. Если не найден — создаём нового пользователя
  if (!user) {
    const { data: newUser, error } = await supabase.auth.admin.createUser({
      email: email || undefined,
      email_confirm: !!email,
      user_metadata: {
        wallet,
        privyDid,
      },
    });
    if (error || !newUser) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
    user = newUser;
  } else {
    // 8. Если найден — обновляем метаданные (wallet, privyDid)
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata || {}),
        wallet,
        privyDid,
      },
    });
  }

  // 9. Генерируем сессию Supabase через Management API (signIn as user)
  // https://supabase.com/docs/guides/auth/server-side/auth-admin-management#sign-in-as-a-user
  const mgmtUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user.id}/tokens`;
  const mgmtRes = await fetch(mgmtUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!mgmtRes.ok) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
  const session = await mgmtRes.json();
  // 10. Возвращаем токены на фронт
  return NextResponse.json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    user,
  });
}
