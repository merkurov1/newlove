/**
 * Safe Telegram Mini App deep-link resolution.
 *
 * Telegram `start_param` is client-controlled and may contain only a limited
 * identifier alphabet. It is never treated as a redirect URL; only an explicit
 * allowlist of first-party routes is accepted.
 */

export const TELEGRAM_MINI_APP_ENTRY = '/lobby';

const SIMPLE_ROUTES: Record<string, string> = {
  lobby: '/lobby',
  flow: '/flow',
  journal: '/journal',
  temple: '/temple',
  selection: '/selection',
  art: '/art-engine',
  'art-engine': '/art-engine',
  vigil: '/vigil',
  cast: '/cast',
  absolution: '/absolution',
  tribute: '/tribute',
};

const SIMPLE_PATH_TO_PARAM: Record<string, string> = {
  '/lobby': 'lobby',
  '/flow': 'flow',
  '/journal': 'journal',
  '/temple': 'temple',
  '/selection': 'selection',
  '/art-engine': 'art',
  '/vigil': 'vigil',
  '/cast': 'cast',
  '/absolution': 'absolution',
  '/tribute': 'tribute',
};

const FLOW_SLUG = /^[\p{L}\p{N}][\p{L}\p{N}-]{0,119}$/u;

/**
 * Browser-safe base64url. The Mini App resolver also runs in the client bundle
 * (`TelegramMiniApp`), so it cannot depend on Node's `Buffer`.
 */
function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function resolveTelegramStartParam(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const value = raw.trim();

  if (!value || value.length > 512) return null;

  const simple = SIMPLE_ROUTES[value];
  if (simple) return simple;

  if (value.startsWith('flow__')) {
    const decoded = decodeBase64Url(value.slice('flow__'.length))?.trim();

    return decoded && FLOW_SLUG.test(decoded) ? `/flow/${encodeURIComponent(decoded)}` : null;
  }

  if (value.startsWith('flow_')) {
    const slug = value.slice('flow_'.length).trim();

    return FLOW_SLUG.test(slug) ? `/flow/${encodeURIComponent(slug)}` : null;
  }

  return null;
}

/**
 * Read `startapp` from the URL as a fallback for `initDataUnsafe.start_param`.
 *
 * Telegram documents that the start parameter is delivered both in signed
 * `initData` and in the GET parameter `tgWebAppStartParam`, so the app can
 * resolve the correct interface immediately, even before the SDK is ready.
 * This value is still untrusted and must pass `resolveTelegramStartParam`.
 */
export function readTelegramStartParamFromUrl(href: string): string | null {
  try {
    const url = new URL(href, 'https://www.merkurov.love');
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    const params = new URLSearchParams([url.search.slice(1), hash].filter(Boolean).join('&'));

    return params.get('tgWebAppStartParam') || params.get('startapp') || null;
  } catch {
    return null;
  }
}

export function buildTelegramStartParam(path: string): string | null {
  const clean = path.trim();

  if (!clean.startsWith('/')) return null;

  const simple = SIMPLE_PATH_TO_PARAM[clean.replace(/\/$/, '') || '/'];

  if (simple) return simple;

  const flow = clean.match(/^\/flow\/([^/?#]+)$/);

  if (!flow) return null;

  let slug: string;

  try {
    slug = decodeURIComponent(flow[1]);
  } catch {
    return null;
  }

  if (!FLOW_SLUG.test(slug)) return null;

  return `flow__${encodeBase64Url(slug)}`;
}
