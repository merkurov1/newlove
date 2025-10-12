import { NextRequest, NextResponse } from 'next/server';
import { Magic } from '@magic-sdk/admin';
import { cookies } from 'next/headers';
import { PrismaClient } from '@prisma/client';

const magic = new Magic(process.env.MAGIC_SECRET_KEY!);
const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  const { didToken } = await req.json();
  if (!didToken) {
    return NextResponse.json({ error: 'No DID token provided' }, { status: 400 });
  }
  try {
    magic.token.validate(didToken);
    const metadata = await magic.users.getMetadataByToken(didToken);
    let email = metadata.email?.toLowerCase() || null;
    let user = null;
    if (email) {
      user = await prisma.user.findUnique({ where: { email } });
    }
    if (!user && metadata.issuer) {
      email = email || `magic_${metadata.issuer.replace(/[^a-zA-Z0-9]/g, '')}@magic.local`;
      user = await prisma.user.create({
        data: {
          email,
          name: metadata.issuer?.slice(0, 12) || 'Magic User',
          image: null,
        },
      });
    }
    if (!user) return NextResponse.json({ error: 'User not found or created' }, { status: 401 });
    // Set a simple session cookie (for demo; use secure cookie in prod)
    cookies().set('magic_user', user.id, { httpOnly: true, path: '/', sameSite: 'lax' });
    return NextResponse.json({ ok: true, user });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 401 });
  }
}
