/**
 * Telegram Instant View links for public Flow publications.
 *
 * Telegram only accepts a `t.me/iv` wrapper when it is paired with a real
 * template hash created by the Instant View editor. The hash is deployment
 * configuration, not a value we can derive or invent. When it is missing or
 * malformed we deliberately return `null` so callers keep the canonical
 * merkurov.love URL and never publish a broken link.
 *
 * This module reads a server-side secret. It must only be imported from
 * server code (the Telegram publisher), never from a client component.
 */

const INSTANT_VIEW_BASE = 'https://t.me/iv';
const CANONICAL_ORIGIN = 'https://www.merkurov.love';
const FLOW_HOSTS = new Set(['merkurov.love', 'www.merkurov.love']);
const FLOW_POST_PATH = /^\/flow\/([^/]+)\/?$/;
const FLOW_RESERVED_SEGMENTS = new Set(['rss', 'rss.xml', 'feed.json', 'i', 'join']);
const TEMPLATE_HASH = /^[a-f0-9]{8,64}$/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type InstantViewEnv = {
  TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH?: string;
  TELEGRAM_INSTANT_VIEW_HASH?: string;
};

/**
 * Template hashes issued by instantview.telegram.org are short hexadecimal
 * strings. Accept either deployment variable name, but never a placeholder,
 * URL, or arbitrary token.
 */
export function telegramInstantViewTemplateHash(
  env: InstantViewEnv = process.env as InstantViewEnv
): string | null {
  const raw = env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH || env.TELEGRAM_INSTANT_VIEW_HASH || '';
  const hash = raw.trim();

  return TEMPLATE_HASH.test(hash) ? hash : null;
}

/**
 * Normalize a canonical public Flow post URL.
 *
 * Only `https://(www.)merkurov.love/flow/<slug>` is accepted. The returned
 * value is rebuilt on the canonical `www` origin with one encoded slug, so a
 * caller cannot smuggle query parameters, fragments, userinfo, ports, a
 * lookalike host, an admin/private route, or a path traversal into the
 * Telegram wrapper.
 */
export function normalizeFlowInstantViewPageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.username || url.password || url.port) return null;
  if (url.search || url.hash) return null;

  const host = url.hostname.toLowerCase();
  if (!FLOW_HOSTS.has(host)) return null;

  const match = url.pathname.match(FLOW_POST_PATH);
  if (!match) return null;

  let slug: string;

  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    return null;
  }

  if (!slug || CONTROL_CHARACTERS.test(slug)) return null;
  if (slug === '.' || slug === '..' || slug.includes('/') || slug.includes('\\')) return null;
  if (FLOW_RESERVED_SEGMENTS.has(slug.toLowerCase())) return null;

  return `${CANONICAL_ORIGIN}/flow/${encodeURIComponent(slug)}`;
}

/**
 * Return a `t.me/iv?url=…&rhash=…` wrapper for a public Flow post.
 *
 * `null` means Instant View is not safely available (no verified hash, wrong
 * domain, or a non-post URL). In that case the caller must use the existing
 * Mini App URL or the canonical page URL unchanged.
 */
export function buildTelegramInstantViewUrl(
  pageUrl: unknown,
  env: InstantViewEnv = process.env as InstantViewEnv
): string | null {
  const hash = telegramInstantViewTemplateHash(env);
  if (!hash) return null;

  const canonical = normalizeFlowInstantViewPageUrl(pageUrl);
  if (!canonical) return null;

  return `${INSTANT_VIEW_BASE}?url=${encodeURIComponent(canonical)}&rhash=${encodeURIComponent(
    hash
  )}`;
}
