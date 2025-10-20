import { NextResponse } from 'next/server';

export async function GET() {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const vars: Record<string, string> = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'present' : 'missing',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'present' : 'missing',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'present' : 'missing',
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ? 'present' : 'missing',
    };
    return NextResponse.json({ ok: true, env: vars });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}

export const dynamic = 'force-dynamic';
