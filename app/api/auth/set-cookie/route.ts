import { NextResponse } from 'next/server';

// Minimal, secure endpoint to set HttpOnly cookies for Supabase session after OAuth redirect.
// Accepts { access_token, refresh_token, expires_at } in POST body.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const accessToken = body?.access_token || null;
    const refreshToken = body?.refresh_token || null;
    const expiresAt = Number(body?.expires_at) || null;

    if (!accessToken) return NextResponse.json({ ok: false, error: 'no access_token' }, { status: 400 });

    // In production require a same-origin Referer/Origin to mitigate abuse.
    try {
      if (process.env.NODE_ENV === 'production') {
        const origin = req.headers.get('origin');
        const referer = req.headers.get('referer');
        const expected = process.env.NEXT_PUBLIC_SITE_URL || (origin || referer || null);
        if (expected && origin && !origin.startsWith(expected)) {
          return NextResponse.json({ ok: false, error: 'origin_mismatch' }, { status: 403 });
        }
        if (expected && referer && !referer.startsWith(expected)) {
          return NextResponse.json({ ok: false, error: 'referer_mismatch' }, { status: 403 });
        }
      }
    } catch (e) {
      // ignore header parsing errors and continue
    }

    const now = Math.floor(Date.now() / 1000);
    const maxAge = expiresAt && expiresAt > now ? Math.max(60, expiresAt - now) : 60 * 60 * 24 * 30; // fallback 30 days

    // Build cookies. We set both sb- and supabase- prefixed cookies to be compatible with helpers in codebase.
    const cookies: string[] = [];
    const cookieOpts = `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
    cookies.push(`sb-access-token=${encodeURIComponent(accessToken)}; ${cookieOpts}`);
    cookies.push(`supabase-access-token=${encodeURIComponent(accessToken)}; ${cookieOpts}`);
    if (refreshToken) {
      cookies.push(`sb-refresh-token=${encodeURIComponent(refreshToken)}; ${cookieOpts}`);
      cookies.push(`supabase-refresh-token=${encodeURIComponent(refreshToken)}; ${cookieOpts}`);
    }

  // Build response and append multiple Set-Cookie headers
  const res = new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  for (const c of cookies) res.headers.append('Set-Cookie', c);
  return res;
  } catch (e) {
    // Log details server-side but do not expose raw error text to the client
    try { console.error('set-cookie error', e); } catch (err) {}
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
