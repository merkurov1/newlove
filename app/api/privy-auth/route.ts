

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
  let authToken;
  try {
    ({ authToken } = await req.json());
    debug.step = 'parse authToken';
    console.log('Received authToken:', authToken);
    console.log('Env:', {
      PRIVY_APP_ID: privyAppId,
      PRIVY_APP_SECRET: privyAppSecret?.slice(0, 4) + '...'
    });
  } catch (e) {
    console.log('debug.step:', 'parse authToken failed');
    console.log('debug.details:', String(e));
    return NextResponse.json({ error: 'Failed to parse authToken', details: String(e), debug }, { status: 500 });
  }
  let claims;
  try {
    debug.step = 'verifyAuthToken';
    claims = await privy.verifyAuthToken(authToken);
    debug.claims = claims;
  } catch (e) {
    debug.step = 'verifyAuthToken failed';
    console.log('debug.step:', 'verifyAuthToken failed');
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
  const wallet_address = privyUser.wallet?.address?.toLowerCase() || null;
  const email = privyUser.email?.address?.toLowerCase() || null;
  // --- PRISMA ONLY ---
  let prismaUser = null;
  try {
    debug.step = 'find or create prisma user';
    // Determine unique field for lookup
    let where: any = {};
    if (email) {
      where.email = email;
    } else if (wallet_address) {
      where.wallet_address = wallet_address;
    } else {
      debug.noUniqueField = true;
      return NextResponse.json({ error: 'No unique identifier (email, wallet_address) for user', debug }, { status: 400 });
    }
    prismaUser = await prisma.user.findUnique({ where });
    // Only use fields that exist in your Prisma schema
    const userData: any = {};
    if (email) userData.email = email;
    if (wallet_address) userData.wallet_address = wallet_address;
    if (privyUser && 'name' in privyUser) userData.name = (privyUser as any).name;
    if (privyUser && 'profilePictureUrl' in privyUser) userData.image = (privyUser as any).profilePictureUrl;
    if (!prismaUser) {
      prismaUser = await prisma.user.create({ data: userData });
    } else {
      prismaUser = await prisma.user.update({ where, data: userData });
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
