import { NextResponse } from 'next/server';
import getUserAndSupabaseForRequest from '@/lib/getUserAndSupabaseForRequest';

function parseCookies(cookieHeader: string | null) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((s: string) => {
        const [k, ...v] = s.split('=');
        return [k?.trim(), decodeURIComponent((v || []).join('='))];
      })
      .filter(Boolean)
  );
}

export async function GET(req: Request) {
  try {
    // Disable this debug endpoint in production to avoid leaking cookie/token info
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const cookieHeader = (req as any).headers?.get?.('cookie') || null;
    const cookies = parseCookies(cookieHeader);

    // For debug only: do not reveal cookie values in full; only report presence and length
    const cookieEntries = Object.keys(cookies).map((k) => ({ name: k, present: true, length: String(cookies[k] || '').length }));

    const sbCandidates: Array<any> = [];
    for (const [k, v] of Object.entries(cookies)) {
      if (/^sb-[^-]+-auth-token(\.|$)/.test(k)) {
        const raw = String(v || '');
        const preview = raw.length > 160 ? raw.slice(0, 160) + '...' : raw;
        let parsedAccessTokenPresent = false;
        let parsedAccessTokenLen: number | null = null;
        try {
          // Try to decode base64 JSON safely. If decode fails, ignore.
          let rawDecoded = decodeURIComponent(raw);
          if (rawDecoded.startsWith('base64-')) rawDecoded = rawDecoded.slice('base64-'.length);
          if (rawDecoded.startsWith('base64:')) rawDecoded = rawDecoded.slice('base64:'.length);
          const asBuffer = Buffer.from(rawDecoded, 'base64').toString('utf8');
          const parsed = JSON.parse(asBuffer || '{}');
          if (parsed && typeof parsed === 'object' && parsed.access_token) {
            parsedAccessTokenPresent = true;
            parsedAccessTokenLen = String(parsed.access_token).length;
          }
        } catch (e) {
          // ignore parse errors
        }
        sbCandidates.push({ name: k, present: true, parsedAccessTokenPresent, parsedAccessTokenLen });
      }
    }

    // Also report presence of explicit sb-access-token / supabase-access-token cookies (but don't reveal values)
    const accessCookies: any = {};
    if (cookies['sb-access-token']) accessCookies['sb-access-token'] = { present: true, length: String(cookies['sb-access-token']).length };
    if (cookies['supabase-access-token']) accessCookies['supabase-access-token'] = { present: true, length: String(cookies['supabase-access-token']).length };

    // Call the shared helper to see whether the server can resolve a user (this will exercise the same parsing logic)
    let userResult: any = { ok: false };
    try {
      const { supabase, user } = await getUserAndSupabaseForRequest(req as any);
      userResult = { ok: true, hasSupabaseClient: Boolean(supabase), user: user ? { id: user.id, email: user.email, role: user.role || user.user_metadata?.role || null } : null };
    } catch (e) {
      // Do not expose raw exception text even in debug; return a flag instead
      try { console.error('cookie-inspect helper failed', e); } catch (err) {}
      userResult = { ok: false, error: 'helper_failed' };
    }

    return NextResponse.json({ ok: true, cookieHeaderPresent: Boolean(cookieHeader), cookies: cookieEntries, sbCandidates, accessCookies, userResult });
  } catch (e) {
    try { console.error('cookie-inspect top-level error', e); } catch (err) {}
    return NextResponse.json({ ok: false, error: 'internal_error' });
  }
}

export const dynamic = 'force-dynamic';
