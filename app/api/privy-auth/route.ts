
import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from 'privy';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { authToken } = await req.json();
    const debug: any = {};

    // 1. Инициализация Privy Admin SDK
    debug.privyAppId = process.env.PRIVY_APP_ID;
    debug.privyAppSecret = process.env.PRIVY_APP_SECRET ? 'set' : 'missing';
    const privy = new PrivyClient(
      process.env.PRIVY_APP_ID!,
      process.env.PRIVY_APP_SECRET!
    );

    // 2. Верификация токена
    let claims;
    try {
      claims = await privy.verifyAuthToken(authToken);
      debug.claims = claims;
    } catch (e) {
      debug.claimsError = String(e);
      return NextResponse.json({ error: 'Invalid Privy token', debug }, { status: 401 });
    }
    if (!claims?.userId) {
      debug.noUserId = true;
      return NextResponse.json({ error: 'No userId in claims', debug }, { status: 401 });
    }

    // 3. Получаем данные пользователя Privy
    let privyUser;
    try {
      privyUser = await privy.users.getUser(claims.userId);
      debug.privyUser = privyUser;
    } catch (e) {
      debug.privyUserError = String(e);
      return NextResponse.json({ error: 'Failed to get privy user', debug }, { status: 500 });
    }
    const wallet = privyUser.wallet?.address?.toLowerCase();
    const email = privyUser.email?.address?.toLowerCase() || null;
    const privyDid = privyUser.id;

    // 4. Инициализация Supabase Admin Client
    debug.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    debug.supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'missing';
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 5. Поиск пользователя по email
    let userByEmail = null;
    if (email) {
      const { data, error } = await supabase
        .from('auth.users')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      debug.userByEmail = data;
      debug.userByEmailError = error;
      userByEmail = data;
    }

    // 6. Поиск по кошельку (в user_metadata)
    let user = userByEmail;
    if (!user && wallet) {
      const { data, error } = await supabase
        .from('auth.users')
        .select('*')
        .contains('raw_user_meta_data', { wallet });
      debug.userByWallet = data;
      debug.userByWalletError = error;
      user = data?.[0] || null;
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
      debug.createUser = newUser;
      debug.createUserError = error;
      if (error || !newUser) {
        return NextResponse.json({ error: 'Failed to create user', debug }, { status: 500 });
      }
      user = newUser;
    } else {
      // 8. Если найден — обновляем метаданные (wallet, privyDid)
      const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata || {}),
          wallet,
          privyDid,
        },
      });
      debug.updateUser = data;
      debug.updateUserError = error;
    }

    // 9. Генерируем сессию Supabase через Management API (signIn as user)
    const mgmtUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user.id}/tokens`;
    debug.mgmtUrl = mgmtUrl;
    let mgmtRes, session;
    try {
      mgmtRes = await fetch(mgmtUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
      debug.mgmtResStatus = mgmtRes.status;
      session = await mgmtRes.json();
      debug.session = session;
    } catch (e) {
      debug.mgmtResError = String(e);
      return NextResponse.json({ error: 'Failed to create session', debug }, { status: 500 });
    }
    if (!mgmtRes.ok) {
      return NextResponse.json({ error: 'Failed to create session', debug }, { status: 500 });
    }
    // 10. Синхронизируем с таблицей User (Prisma)
    let prismaUser = null;
    try {
      prismaUser = await prisma.user.findUnique({ where: { email } });
      if (!prismaUser) {
        prismaUser = await prisma.user.create({
          data: {
            email: email || undefined,
            name: privyUser?.name || null,
            image: privyUser?.profilePictureUrl || null,
            // Можно добавить другие поля, если нужно
          },
        });
      }
    } catch (e) {
      debug.prismaUserError = String(e);
    }
    // 11. Возвращаем токены на фронт
    return NextResponse.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user,
      prismaUser,
      debug,
    });
  } catch (e) {
    return NextResponse.json({ error: 'Unexpected error', details: String(e) }, { status: 500 });
  }
}
