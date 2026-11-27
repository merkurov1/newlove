/**
 * Classify a Flow link for presentation.
 *
 * The feed and the reader show three link families:
 *
 * - `telegram` — a destination on Telegram (a channel post, a chat or a bot);
 * - `internal` — a page on merkurov.love, opened as an internal route;
 * - `external` — everything else, which keeps the existing preview card.
 *
 * Invalid or missing URLs are treated as external so a malformed preview can
 * never turn into an internal or Telegram affordance.
 */

export type FlowLinkKind = 'telegram' | 'internal' | 'external';

const INTERNAL_HOST = 'merkurov.love';

const TELEGRAM_HOSTS = new Set([
  't.me',
  'telegram.me',
  'telegram.dog',
  'telegram.com',
  'tg.dev',
]);

function normalizedHost(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

function parseHttpUrl(value: string | null | undefined): URL | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.trim());

    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function flowLinkKind(value: string | null | undefined): FlowLinkKind {
  const url = parseHttpUrl(value);

  if (!url) return 'external';

  const host = normalizedHost(url.hostname);

  if (TELEGRAM_HOSTS.has(host) || host === 'telegram.org' || host.endsWith('.telegram.org')) {
    return 'telegram';
  }

  if (host === INTERNAL_HOST || host.endsWith(`.${INTERNAL_HOST}`)) {
    return 'internal';
  }

  return 'external';
}

/**
 * The route for an internal Flow link, preserving query and hash. Returns
 * `null` for every other family so the caller can keep a plain anchor.
 */
export function internalFlowPath(value: string | null | undefined): string | null {
  if (flowLinkKind(value) !== 'internal') return null;

  const url = parseHttpUrl(value);

  if (!url) return null;

  return `${url.pathname || '/'}${url.search}${url.hash}`;
}

/** `true` for relative links and absolute merkurov.love destinations. */
export function isInternalFlowHref(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;

  const href = value.trim();

  if (!href) return false;
  if (href.startsWith('/') && !href.startsWith('//')) return true;

  return flowLinkKind(href) === 'internal';
}
