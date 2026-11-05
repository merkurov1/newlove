/**
 * Pure helpers for Flow image delivery.
 *
 * Next.js image optimization is already configured for Supabase, Bluesky,
 * YouTube, Medium and a few other hosts. This module only adds a bounded
 * Supabase transform before the Next optimizer sees the URL, and keeps unknown
 * external hosts on a plain lazy image so a link preview can never crash the
 * page through an unconfigured remote pattern.
 */

const NEXT_IMAGE_HOSTS = new Set([
  'txvkqcitalfbjytmnawq.supabase.co',
  'nzasvblckrwsnlxsqfma.supabase.co',
  'lh3.googleusercontent.com',
  'cdn.bsky.app',
  'i.ytimg.com',
  'miro.medium.com',
  'cdn-images-1.medium.com',
  'medium.com',
  'example.com',
  'i.ibb.co',
]);

function parseUrl(value: string, base = 'https://www.merkurov.love'): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

export function isSupabaseStorageUrl(value: string): boolean {
  const url = parseUrl(value);
  return Boolean(
    url &&
      url.hostname.endsWith('.supabase.co') &&
      url.pathname.includes('/storage/v1/object/public/')
  );
}

export function canUseNextImage(value: string): boolean {
  if (!value) return false;
  if (/\.(svg|gif)(?:$|[?#])/i.test(value)) return false;

  const url = parseUrl(value);
  if (!url) return false;
  if (url.protocol !== 'https:' && url.origin !== 'https://www.merkurov.love') {
    return false;
  }

  if (url.hostname === 'www.merkurov.love' || url.hostname === 'merkurov.love') {
    return true;
  }

  return (
    NEXT_IMAGE_HOSTS.has(url.hostname) ||
    url.hostname.endsWith('.supabase.co') ||
    url.hostname.endsWith('.medium.com')
  );
}

/**
 * Adds one bounded Supabase transform. Existing width/quality parameters are
 * preserved, so a retry or a URL already transformed by another caller is not
 * transformed twice.
 */
export function withSupabaseImageTransform(
  value: string,
  width = 1200,
  quality = 80
): string {
  if (!isSupabaseStorageUrl(value)) return value;

  const url = parseUrl(value);
  if (!url) return value;

  if (!url.searchParams.has('width')) {
    url.searchParams.set('width', String(Math.max(1, Math.round(width))));
  }
  if (!url.searchParams.has('quality')) {
    url.searchParams.set('quality', String(Math.min(Math.max(quality, 1), 100)));
  }

  return url.toString();
}

export function flowImageSrc(value: string, width = 1200): string {
  return withSupabaseImageTransform(value, width);
}
