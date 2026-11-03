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
};

const FLOW_SLUG = /^[\p{L}\p{N}][\p{L}\p{N}-]{0,119}$/u;

export function resolveTelegramStartParam(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const value = raw.trim();

  if (!value || value.length > 512) return null;

  const simple = SIMPLE_ROUTES[value];
  if (simple) return simple;

  if (value.startsWith('flow__')) {
    try {
      const decoded = Buffer.from(value.slice('flow__'.length), 'base64url')
        .toString('utf8')
        .trim();

      return FLOW_SLUG.test(decoded) ? `/flow/${encodeURIComponent(decoded)}` : null;
    } catch {
      return null;
    }
  }

  if (value.startsWith('flow_')) {
    const slug = value.slice('flow_'.length).trim();

    return FLOW_SLUG.test(slug) ? `/flow/${encodeURIComponent(slug)}` : null;
  }

  return null;
}

export function buildTelegramStartParam(path: string): string | null {
  const clean = path.trim();

  if (!clean.startsWith('/')) return null;

  if (clean === '/lobby') return 'lobby';
  if (clean === '/flow') return 'flow';
  if (clean === '/journal') return 'journal';
  if (clean === '/temple') return 'temple';
  if (clean === '/selection') return 'selection';
  if (clean === '/art-engine') return 'art';

  const flow = clean.match(/^\/flow\/([^/?#]+)$/);

  if (!flow) return null;

  let slug: string;

  try {
    slug = decodeURIComponent(flow[1]);
  } catch {
    return null;
  }

  if (!FLOW_SLUG.test(slug)) return null;

  return `flow__${Buffer.from(slug, 'utf8').toString('base64url')}`;
}
