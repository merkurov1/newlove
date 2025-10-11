

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
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
  const privyAppId = process.env.PRIVY_APP_ID;
  const privyAppSecret = process.env.PRIVY_APP_SECRET;
  if (!privyAppId || !privyAppSecret) {
    throw new Error('Missing Privy credentials in environment variables.');
  }
  const privy = new PrivyClient(privyAppId, privyAppSecret);
  let body;
  try {
    body = await req.json();
    debug.step = 'parse body';
    debug.bodyKeys = Object.keys(body || {});
    console.log('Received body keys:', debug.bodyKeys);
  } catch (e) {
    console.log('debug.step:', 'parse body failed');
    console.log('debug.details:', String(e));
    return NextResponse.json({ error: 'Failed to parse body', details: String(e), debug }, { status: 500 });
  }

  const authToken = typeof body?.authToken === 'string' ? body.authToken : null;
  const idToken = typeof body?.idToken === 'string' ? body.idToken : null;
  if (!authToken && !idToken) {
    debug.step = 'authToken/idToken missing or invalid';
    debug.authToken = authToken;
    debug.idToken = idToken;
    return NextResponse.json({ error: 'authToken/idToken missing or invalid', debug }, { status: 400 });
  }

  let claims;
  try {
    debug.step = 'verify token';
    if (authToken) {
      claims = await privy.verifyAuthToken(authToken);
      debug.which = 'authToken';
    } else {
      // try id token verification if available
      claims = await privy.verifyAuthToken(idToken);
      debug.which = 'idToken';
    }
    debug.claims = claims;
  } catch (e) {
    debug.step = 'verify token failed';
    debug.authToken = authToken;
    debug.idToken = idToken;
    console.log('debug.step:', 'verify token failed');
    console.log('debug.details:', String(e));
    return NextResponse.json({ error: 'Invalid Privy token', details: String(e), debug }, { status: 401 });
  }
  if (!claims?.userId) {
    debug.step = 'claims.userId missing';
    return NextResponse.json({ error: 'No userId in claims', debug }, { status: 401 });
  }
  let privyUser;
  try {
    debug.step = 'getUser from privy';
    privyUser = await privy.getUser(claims.userId);
    debug.privyUser = privyUser;
  } catch (e) {
    debug.step = 'getUser from privy failed';
    return NextResponse.json({ error: 'Failed to get privy user', details: String(e), debug }, { status: 500 });
  }
  const walletAddress = privyUser.wallet?.address?.toLowerCase() || null;
  let email = privyUser.email?.address?.toLowerCase() || null;
  // Если email отсутствует, генерируем виртуальный email на основе walletAddress
  if (!email && walletAddress) {
    email = `wallet_${walletAddress}@privy.local`;
  }
  // --- PRISMA ONLY ---
  let prismaUser = null;
  try {
    debug.step = 'find or create prisma user';
    // Determine unique field for lookup
    let userData: any = {};
    if (email) userData.email = email;
    if (walletAddress) userData.walletAddress = walletAddress;
    if (privyUser && 'name' in privyUser) userData.name = (privyUser as any).name;
    if (privyUser && 'profilePictureUrl' in privyUser) userData.image = (privyUser as any).profilePictureUrl;

    // Try to find by email (unique)
    if (email) {
      prismaUser = await prisma.user.findUnique({ where: { email } });
    }
    // If not found, try to find by walletAddress (not unique, so use findFirst)
    if (!prismaUser && walletAddress) {
      prismaUser = await prisma.user.findFirst({ where: { walletAddress } });
    }
    // If not found, create new user
    if (!prismaUser) {
      prismaUser = await prisma.user.create({ data: userData });
    } else {
      prismaUser = await prisma.user.update({ where: { id: prismaUser.id }, data: userData });
    }
    debug.prismaUser = prismaUser;
  } catch (e) {
    debug.step = 'find or create prisma user failed';
    debug.prismaUserError = String(e);
    return NextResponse.json({ error: 'Prisma user create/find failed', details: String(e), debug }, { status: 500 });
  }
  debug.step = 'success';
  return NextResponse.json({
    prismaUser,
    debug,
  });
  // (all Prisma logic and response is above; remove unreachable/duplicate code below)
}

export async function GET(req: NextRequest) {
  // Quick debug endpoint: return cookies and env info
  const cookieHeader = req.headers.get('cookie') || '';
  const cookieMap: Record<string,string> = {};
  cookieHeader.split(';').forEach(c => {
    const [k,v] = c.split('=');
    if (k && v) cookieMap[k.trim()] = decodeURIComponent(v.trim());
  });
  return NextResponse.json({ env: { PRIVY_APP_ID: process.env.PRIVY_APP_ID, NODE_ENV: process.env.NODE_ENV }, cookies: cookieMap });
}
