import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Protect debug endpoints from production use
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const out: any = { timestamp: new Date().toISOString(), service: null, request: null };
  // Try service-role client first
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const svc = getServerSupabaseClient({ useServiceRole: true });
    try {
      const p = await svc.from('projects').select('id,slug').limit(1);
      out.service = { projects: p, ok: !p.error };
    } catch (e) {
      out.service = { error: String(e) };
    }
    try {
      const a = await svc.from('articles').select('id,slug').limit(1);
      out.service = { ...(out.service || {}), articles: a, ok: !(a && a.error) };
    } catch (e) {
      out.service = { ...(out.service || {}), articlesError: String(e) };
    }
  } catch (e) {
    out.service = { error: 'service client init failed: ' + String(e) };
  }

  // Try request-scoped client using helper
  try {
    const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
    const ctx = await getUserAndSupabaseForRequest(req as Request);
    const supabase = ctx?.supabase || null;
    if (!supabase) {
      out.request = { error: 'no request-scoped supabase client available (no session)' };
    } else {
      try {
        const p = await supabase.from('projects').select('id,slug').limit(1);
        out.request = { projects: p, ok: !p.error };
      } catch (e) {
        out.request = { projectsError: String(e) };
      }
      try {
        const a = await supabase.from('articles').select('id,slug').limit(1);
        out.request = { ...(out.request || {}), articles: a, ok: !(a && a.error) };
      } catch (e) {
        out.request = { ...(out.request || {}), articlesError: String(e) };
      }
    }
  } catch (e) {
    out.request = { error: 'request client init failed: ' + String(e) };
  }

  return NextResponse.json(out);
}
