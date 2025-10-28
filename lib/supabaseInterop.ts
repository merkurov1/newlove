// lib/supabaseInterop.js
// Small helper to normalize different module export shapes for `supabase-server`.
// Some builds produce named exports, some produce default, and some produce the function directly.
export async function getUserAndSupabaseFromRequestInterop(req) {
  // Import the canonical path used by the app (supports both .js and .ts builds)
  let mod;
  try {
    mod = await import('@/lib/supabase-server');
  } catch (e) {
    // Fallback to relative import for environments that resolve differently
    mod = await import('./supabase-server');
  }

  // 1) Named export
  if (mod && typeof mod.getUserAndSupabaseFromRequest === 'function') {
    return mod.getUserAndSupabaseFromRequest(req);
  }

  // 2) Default export that's a function
  if (mod && typeof mod.default === 'function') {
    return mod.default(req);
  }

  // 3) Module itself exported as function (rare)
  if (typeof mod === 'function') {
    return mod(req);
  }

  // 4) Maybe default is an object with the function
  if (mod && mod.default && typeof mod.default.getUserAndSupabaseFromRequest === 'function') {
    return mod.default.getUserAndSupabaseFromRequest(req);
  }

  throw new Error('supabase-server does not export getUserAndSupabaseFromRequest (checked named/default/module formats)');
}

export default getUserAndSupabaseFromRequestInterop;
