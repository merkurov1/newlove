import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { key } = await request.json();
    const adminSecret = process.env.ADMIN_SECRET_KEY;

    if (key && adminSecret && key === adminSecret) {
      const cookieStore = await cookies();
      cookieStore.set({
        name: 'unframed_admin',
        value: 'true',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid key' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
