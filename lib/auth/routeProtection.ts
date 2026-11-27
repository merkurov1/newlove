/**
 * Routes that need Supabase Auth cookie refresh in middleware.
 *
 * Public pages do not read the cookie session; they use service-role data
 * loaders or client-side auth. Running `getClaims()` on every public page
 * creates an unnecessary Auth request and can wake PostgREST on a cache miss.
 */
const AUTH_PREFIXES = [
  '/admin',
  // Admin APIs do not match the page matcher in proxy.ts, so without this
  // prefix an open workspace would keep using an expired access token. The
  // proxy refreshes the Supabase cookie before the route handler runs, which
  // is what keeps an authenticated owner from receiving a spurious 401.
  '/api/admin',
  '/profile',
  '/research/telegram',
  '/heartandangel/world',
] as const;

export function needsAuthRefresh(pathname: string): boolean {
  return AUTH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
