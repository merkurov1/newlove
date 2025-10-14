// lib/supabaseInterop.js
// Small helper to normalize different module export shapes for `supabase-server`.
// Some builds produce named exports, some produce default, and some produce the function directly.
export async function getUserAndSupabaseFromRequestInterop(req) {
  const mod = await import('./supabase-server');
  // try named export first
  if (mod && typeof mod.getUserAndSupabaseFromRequest === 'function') return mod.getUserAndSupabaseFromRequest(req);
  // default export
  if (mod && typeof mod.default === 'function') return mod.default(req);
  // module itself could be the function
  if (typeof mod === 'function') return mod(req);
  // last resort: throw helpful error
  throw new Error('supabase-server does not export getUserAndSupabaseFromRequest');
}

export default getUserAndSupabaseFromRequestInterop;
