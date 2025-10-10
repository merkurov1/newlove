
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from 'privy';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const debug: any = {};
  debug.env = {
    PRIVY_APP_ID: process.env.PRIVY_APP_ID,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };
  let authToken;
  try {
    ({ authToken } = await req.json());
    debug.step = 'parse authToken';
  } catch (e) {
    return NextResponse.json({ error: 'Failed to parse authToken', details: String(e), debug }, { status: 500 });
  }
  let privy;
  try {
    debug.step = 'init privy';
    privy = new PrivyClient(process.env.PRIVY_APP_ID!, process.env.PRIVY_APP_SECRET!);
  } catch (e) {
    debug.step = 'init privy failed';
    return NextResponse.json({ error: 'PrivyClient init failed', details: String(e), debug }, { status: 500 });
  }
  let claims;
  try {
    debug.step = 'verifyAuthToken';
    claims = await privy.verifyAuthToken(authToken);
    debug.claims = claims;
  } catch (e) {
    debug.step = 'verifyAuthToken failed';
    return NextResponse.json({ error: 'Invalid Privy token', details: String(e), debug }, { status: 401 });
  }
  if (!claims?.userId) {
    debug.step = 'claims.userId missing';
    return NextResponse.json({ error: 'No userId in claims', debug }, { status: 401 });
  }
  let privyUser;
  try {
    debug.step = 'getUser from privy';
    privyUser = await privy.users.getUser(claims.userId);
    debug.privyUser = privyUser;
  } catch (e) {
    debug.step = 'getUser from privy failed';
    return NextResponse.json({ error: 'Failed to get privy user', details: String(e), debug }, { status: 500 });
  }
  const wallet = privyUser.wallet?.address?.toLowerCase();
  const email = privyUser.email?.address?.toLowerCase() || null;
  const privyDid = privyUser.id;
  let supabase;
  try {
    debug.step = 'init supabase';
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  } catch (e) {
    debug.step = 'init supabase failed';
    return NextResponse.json({ error: 'Supabase client init failed', details: String(e), debug }, { status: 500 });
  }
  let userByEmail = null;
  try {
    debug.step = 'find user by email';
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
  } catch (e) {
    debug.step = 'find user by email failed';
    return NextResponse.json({ error: 'Supabase find user by email failed', details: String(e), debug }, { status: 500 });
  }
  let user = userByEmail;
  try {
    debug.step = 'find user by wallet';
    if (!user && wallet) {
      const { data, error } = await supabase
        .from('auth.users')
        .select('*')
        .contains('raw_user_meta_data', { wallet });
      debug.userByWallet = data;
      debug.userByWalletError = error;
      user = data?.[0] || null;
    }
  } catch (e) {
    debug.step = 'find user by wallet failed';
    return NextResponse.json({ error: 'Supabase find user by wallet failed', details: String(e), debug }, { status: 500 });
  }
  try {
    debug.step = 'create or update user in supabase';
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
  } catch (e) {
    debug.step = 'create or update user in supabase failed';
    return NextResponse.json({ error: 'Supabase create/update user failed', details: String(e), debug }, { status: 500 });
  }
  let session, mgmtRes;
  try {
    debug.step = 'create supabase session';
    const mgmtUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user.id}/tokens`;
    debug.mgmtUrl = mgmtUrl;
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
    if (!mgmtRes.ok) {
      return NextResponse.json({ error: 'Failed to create session', debug }, { status: 500 });
    }
  } catch (e) {
    debug.step = 'create supabase session failed';
    return NextResponse.json({ error: 'Failed to create session', details: String(e), debug }, { status: 500 });
  }
  let prismaUser = null;
  try {
    debug.step = 'find or create prisma user';
    prismaUser = await prisma.user.findUnique({ where: { email } });
    if (!prismaUser) {
      prismaUser = await prisma.user.create({
        data: {
          email: email || undefined,
          name: privyUser?.name || null,
          image: privyUser?.profilePictureUrl || null,
        },
      });
    }
    debug.prismaUser = prismaUser;
  } catch (e) {
    debug.step = 'find or create prisma user failed';
    debug.prismaUserError = String(e);
    return NextResponse.json({ error: 'Prisma user create/find failed', details: String(e), debug }, { status: 500 });
  }
  debug.step = 'success';
  return NextResponse.json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    user,
    prismaUser,
    debug,
  });
}
