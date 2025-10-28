// lib/getSupabaseForRequest.js
// Small shim for JS files to import the TS canonical wrapper.
export async function getUserAndSupabaseForRequest(req) {
  const mod = await import('./getUserAndSupabaseForRequest');
  const fn = mod.getUserAndSupabaseForRequest || mod.default || mod;
  return fn(req);
}

// Backwards-compatible alias for older callers
export async function getSupabaseForRequest(req) {
  return getUserAndSupabaseForRequest(req);
}

export default getUserAndSupabaseForRequest;
