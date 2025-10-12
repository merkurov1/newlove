import { NextRequest, NextResponse } from 'next/server';
import { Magic } from '@magic-sdk/admin';

const magic = new Magic(process.env.MAGIC_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const { didToken } = await req.json();
  if (!didToken) {
    return NextResponse.json({ error: 'No DID token provided' }, { status: 400 });
  }
  try {
    magic.token.validate(didToken);
    const metadata = await magic.users.getMetadataByToken(didToken);
    return NextResponse.json({ user: metadata });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 401 });
  }
}
