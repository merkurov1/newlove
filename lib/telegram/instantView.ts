/**
 * Telegram Instant View links for public Flow publications.
 *
 * Telegram only accepts a `t.me/iv` wrapper when it is paired with a real
 * template hash created by the Instant View editor. The hash is deployment
 * configuration, not a value we can derive or invent. When it is missing or
 * malformed we deliberately return `null` so callers keep the canonical
 * merkurov.love URL and never publish a broken link.
 */

const INSTANT_VIEW_BASE = 'https://t.me/iv';
const FLOW_HOST = 'merkurov.love';
const FLOW_POST_PATH = /^\/flow\/([^/?#]+)\/?$/;
const FLOW_RESERVED_SEGMENTS = new Set(['rss', 'rss.xml', 'feed.json', 'i', 'join']);
const TEMPLATE_HASH = /^[a-f0-9]{8,64}$/i;

export type InstantViewEnv = {
  TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH?: string;
  TELEGRAM_INSTANT_VIEW_HASH?: string;
};

/**
 * Template hashes issued by instantview.telegram.org are lowercase hex
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
 * Only wrap canonical public Flow post URLs on the project domain. This keeps
 * the helper from becoming an open link wrapper and keeps private/admin
 * routes out of Instant View even if a caller passes an unexpected URL.
 */
export function normalizeFlowInstantViewPageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.port || url.username || url.password) {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== FLOW_HOST) return null;

  const match = url.pathname.match(FLOW_POST_PATH);
  if (!match) return null;

  try {
    const slug = decodeURIComponent(match[1]).toLowerCase();
    if (FLOW_RESERVED_SEGMENTS.has(slug)) return null;
  } catch {
    return null;
  }

  return url.toString();
}

/**
 * Return a `t.me/iv?url=…&rhash=…` wrapper for a public Flow post.
 *
 * `null` means Instant View is not safely available (no verified hash, wrong
 * domain, or a non-post URL). In that case the caller must use the canonical
 * page URL unchanged.
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
