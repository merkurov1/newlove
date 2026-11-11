import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { signUnframedToken } from '@/lib/unframed/access';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (!left.length || left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const limited = checkRateLimit(getClientIp(request), {
    interval: 15 * 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'unframed-admin',
  });
  if (limited) return limited;

  const adminSecret = process.env.ADMIN_SECRET_KEY;

  if (!adminSecret) {
    console.error('[unframed/admin] ADMIN_SECRET_KEY is not configured');
    return NextResponse.json(
      { error: 'Administrative access is temporarily unavailable' },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
    const key = body?.key;

    if (typeof key !== 'string' || !safeEqual(key, adminSecret)) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 401 });
    }

    const token = signUnframedToken('admin', 60 * 60 * 24 * 30);

    if (!token) {
      console.error('[unframed/admin] Access token secret is not configured');
      return NextResponse.json({ error: 'Access configuration error' }, { status: 503 });
    }

    const cookieStore = await cookies();
    cookieStore.set({
      name: 'unframed_admin',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[unframed/admin] Unexpected error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
