import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LEGACY_COOKIES = [
  'sb-access-token',
  'sb-refresh-token',
  'supabase-access-token',
  'supabase-refresh-token',
];

export async function POST() {
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch {
    // Cookie clearing below still runs even if the remote session is already gone.
  }

  const response = NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } }
  );

  // Remove the legacy duplicate cookies created by older auth code. The SSR
  // client already clears its own sb-<project>-auth-token cookies.
  for (const name of LEGACY_COOKIES) {
    response.cookies.set({
      name,
      value: '',
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
    });
  }

  return response;
}
