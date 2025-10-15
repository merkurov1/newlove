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
    const cookieHeader = (req as any).headers?.get?.('cookie') || null;
    const cookies = parseCookies(cookieHeader);

    const cookieEntries = Object.keys(cookies).map((k) => ({ name: k, preview: String(cookies[k] || '').slice(0, 120) + (String(cookies[k] || '').length > 120 ? '...' : '') }));

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
        sbCandidates.push({ name: k, preview: preview.length > 200 ? preview.slice(0, 200) + '...' : preview, parsedAccessTokenPresent, parsedAccessTokenLen });
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
      userResult = { ok: false, error: String(e) };
    }

    return NextResponse.json({ ok: true, cookieHeaderPresent: Boolean(cookieHeader), cookies: cookieEntries, sbCandidates, accessCookies, userResult });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}

export const dynamic = 'force-dynamic';
