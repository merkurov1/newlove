/**
 * Verified image-source policy for structured Pierrot galleries.
 *
 * Markdown images remain blocked. A gallery image is rendered only when its
 * URL is same-origin, an explicit merkurov.love host, or the project's own
 * Supabase storage. Unknown hosts, data URLs and protocol-relative URLs are
 * rejected rather than proxied or guessed.
 */

const DEFAULT_ALLOWED_HOSTS = ['merkurov.love', 'www.merkurov.love'];

function configuredHosts(): string[] {
  const raw = process.env.NEXT_PUBLIC_PIERROT_IMAGE_HOSTS || '';
  const extra = raw
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  let supabaseHost = '';
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url) supabaseHost = new URL(url).hostname.toLowerCase();
  } catch {
    supabaseHost = '';
  }

  return Array.from(
    new Set([...DEFAULT_ALLOWED_HOSTS, ...extra, ...(supabaseHost ? [supabaseHost] : [])])
  );
}

export function isAllowedPierrotImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const src = value.trim();
  if (!src) return false;

  // Relative, same-origin paths. Protocol-relative URLs are not same-origin.
  if (src.startsWith('/') && !src.startsWith('//')) return true;

  try {
    const url = new URL(src);
    if (url.protocol !== 'https:') return false;
    if (!url.pathname || url.pathname === '/') return false;

    const host = url.hostname.toLowerCase();
    if (configuredHosts().includes(host)) return true;

    // Never allow arbitrary third-party images, even from a linked article.
    return false;
  } catch {
    return false;
  }
}

export function safePierrotImageUrl(value: unknown): string | null {
  return isAllowedPierrotImageUrl(value) ? value.trim() : null;
}
