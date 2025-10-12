import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const privyAppId = process.env.PRIVY_APP_ID;
  const privyAppSecret = process.env.PRIVY_APP_SECRET;
  if (!privyAppId || !privyAppSecret) {
    return NextResponse.json({ error: 'Missing Privy credentials' }, { status: 500 });
  }
  const privy = new PrivyClient(privyAppId, privyAppSecret);
  let token = null;
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  // 1. Попытка из body
  token = body?.authToken;
  // 2. Попытка из Authorization header
  if (!token) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }
  // 3. Попытка из cookies
  if (!token) {
    const cookie = req.cookies.get('privy-token')?.value || req.cookies.get('privy-id-token')?.value;
    if (cookie) token = cookie;
  }
  if (!token) {
    return NextResponse.json({ error: 'No Privy token found' }, { status: 400 });
  }
  let claims, privyUser;
  try {
    claims = await privy.verifyAuthToken(token);
    privyUser = await privy.getUser(claims.userId);
  } catch (e: any) {
    return NextResponse.json({ error: 'Invalid Privy token', details: String(e) }, { status: 401 });
  }
  // Синхронизация с Supabase/Prisma
  const walletAddress = privyUser.wallet?.address?.toLowerCase() || null;
  let email = privyUser.email?.address?.toLowerCase() || null;
  if (!email && walletAddress) {
    email = `wallet_${walletAddress}@privy.local`;
  }
  let prismaUser = null;
  let userData: any = { email, walletAddress };
  if (privyUser && 'name' in privyUser) userData.name = privyUser.name;
  if (privyUser && 'profilePictureUrl' in privyUser) userData.image = privyUser.profilePictureUrl;
  try {
    if (email) {
      prismaUser = await prisma.user.findUnique({ where: { email } });
    }
    if (!prismaUser && walletAddress) {
      prismaUser = await prisma.user.findFirst({ where: { walletAddress } });
    }
    if (!prismaUser) {
      prismaUser = await prisma.user.create({ data: userData });
    } else {
      prismaUser = await prisma.user.update({ where: { id: prismaUser.id }, data: userData });
    }
  } catch (e: any) {
    return NextResponse.json({ error: 'Prisma user sync failed', details: String(e) }, { status: 500 });
  }
  return NextResponse.json({
    id: prismaUser.id,
    email: prismaUser.email,
    walletAddress: prismaUser.walletAddress,
    name: prismaUser.name,
    image: prismaUser.image,
    supabaseId: prismaUser.id,
    privyUser,
    claims,
  });
}
