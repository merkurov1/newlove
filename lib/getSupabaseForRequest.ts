// lib/getSupabaseForRequest.js
// Small shim for JS files to import the TS canonical wrapper.
export async function getUserAndSupabaseForRequest(req: any) {
  const mod: any = await import('./getUserAndSupabaseForRequest');
  const fn = mod.getUserAndSupabaseForRequest || mod.default || mod;
  return (fn as any)(req);
}

// Backwards-compatible alias for older callers
export async function getSupabaseForRequest(req: any) {
  return getUserAndSupabaseForRequest(req);
}

export default getUserAndSupabaseForRequest;
