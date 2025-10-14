// lib/getSupabaseForRequest.js
export async function getSupabaseForRequest(req) {
  try {
    const mod = await import('@/lib/supabase-server');
    const fn = mod.getUserAndSupabaseFromRequest || mod.default || mod;
    const res = await fn(req);
    if (res && res.supabase) return { supabase: res.supabase, isServer: false, user: res.user };
  } catch (e) {
    // ignore and fall through to service role
  }

  try {
    const srv = await import('@/lib/serverAuth');
    const supabase = srv.getServerSupabaseClient();
    return { supabase, isServer: true };
  } catch (e) {
    return { supabase: null, isServer: false };
  }
}
