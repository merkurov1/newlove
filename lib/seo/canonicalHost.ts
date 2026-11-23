/**
 * Host normalisation that does not depend on `next.config.js` redirects.
 *
 * Production serves the same document from `merkurov.love` and
 * `www.merkurov.love` (both HTTP 200) while every canonical points at the
 * `www` host. A middleware-level 308 keeps a single canonical origin even if
 * the hosting layer ignores the static redirect configuration.
 */
export const CANONICAL_HOST = 'www.merkurov.love';
export const APEX_HOST = 'merkurov.love';

function normaliseHost(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/:\d+$/, '');
}

/**
 * Returns the canonical HTTPS `www` URL when the request is for the apex host
 * or for plain HTTP on the canonical host. Returns `null` for preview hosts,
 * localhost and already-canonical requests, which prevents redirect loops.
 */
export function canonicalHostRedirect(url: URL, hostHeader?: string | null): URL | null {
  const host = normaliseHost(hostHeader || url.host);

  if (host !== APEX_HOST && host !== CANONICAL_HOST) return null;

  const isHttps = url.protocol === 'https:';
  if (host === CANONICAL_HOST && isHttps) return null;

  const target = new URL(url.toString());
  target.protocol = 'https:';
  target.hostname = CANONICAL_HOST;
  target.port = '';
  return target;
}
