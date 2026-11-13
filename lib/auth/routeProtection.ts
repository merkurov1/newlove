/**
 * Routes that need Supabase Auth cookie refresh in middleware.
 *
 * Public pages do not read the cookie session; they use service-role data
 * loaders or client-side auth. Running `getClaims()` on every public page
 * creates an unnecessary Auth request and can wake PostgREST on a cache miss.
 */
const AUTH_PREFIXES = [
  '/admin',
  '/profile',
  '/research/telegram',
  '/heartandangel/world',
] as const;

export function needsAuthRefresh(pathname: string): boolean {
  return AUTH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
