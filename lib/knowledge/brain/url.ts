import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * URL handling for the owner-only Brain ingestion queue.
 *
 * Identity is deliberately scheme-insensitive (http and https collapse to
 * https) and tracking parameters are removed, so the same article cannot be
 * queued twice under cosmetic URL variations.
 */

export class BrainUrlError extends Error {
  readonly code: string;
  readonly retryAfterSeconds: number | null;

  constructor(code: string, retryAfterSeconds: number | null = null) {
    super(code);
    this.name = 'BrainUrlError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const BRAIN_MAX_URL_LENGTH = 2048;

const TRACKING_PARAMS = new Set([
  '_ga',
  '_gl',
  'fbclid',
  'gclid',
  'gbraid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  'oly_anon_id',
  'oly_enc_id',
  'rb_clickid',
  'ref_src',
  'ref_url',
  's_cid',
  'sc_cid',
  'spm',
  'ttclid',
  'twclid',
  'vero_id',
  'wickedid',
  'yclid',
]);

const TRACKING_PREFIXES = ['utm_', 'mtm_', 'pk_', 'piwik_', 'ga_'];

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return TRACKING_PARAMS.has(lower) || TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function retryAfterSeconds(value: string | null): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(3600, Math.ceil(seconds));

  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;

  return Math.max(0, Math.min(3600, Math.ceil((date - Date.now()) / 1000)));
}

function stripBrackets(value: string): string {
  return value
    .trim()
    .replace(/^[<"']+/, '')
    .replace(/[>"']+$/, '');
}

/**
 * Normalizes a user-supplied URL for storage and duplicate checks.
 * Throws BrainUrlError for invalid input.
 */
export function normalizeSourceUrl(raw: string): string {
  const trimmed = stripBrackets(raw);

  if (!trimmed) throw new BrainUrlError('url_empty');

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;

  try {
    parsed = new URL(withScheme);
  } catch {
    throw new BrainUrlError('url_invalid');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BrainUrlError('protocol_unsupported');
  }

  if (parsed.username || parsed.password) {
    throw new BrainUrlError('credentials_forbidden');
  }

  // Treat http and https as the same article.
  parsed.protocol = 'https:';
  parsed.hash = '';

  if (
    (parsed.port === '80' || parsed.port === '443') &&
    (parsed.protocol === 'https:' || parsed.protocol === 'http:')
  ) {
    parsed.port = '';
  }

  parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');

  const params = Array.from(parsed.searchParams.entries())
    .filter(([name]) => !isTrackingParam(name))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
    );

  parsed.search = '';
  for (const [name, value] of params) {
    parsed.searchParams.append(name, value);
  }

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }

  const result = parsed.toString();

  if (result.length > BRAIN_MAX_URL_LENGTH) {
    throw new BrainUrlError('url_too_long');
  }

  return result;
}

export function tryNormalizeSourceUrl(raw: string): { url: string | null; error: string | null } {
  try {
    return { url: normalizeSourceUrl(raw), error: null };
  } catch (error) {
    return {
      url: null,
      error: error instanceof BrainUrlError ? error.code : 'url_invalid',
    };
  }
}

/**
 * Returns the lower-case host without a leading `www.` or trailing dot.
 * Used for provenance metadata; it never participates in authorization.
 */
export function getSourceDomain(raw: string): string | null {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/^www\./, '');

    return host || null;
  } catch {
    return null;
  }
}

const NOVAYA_GAZETA_HOSTS = new Set(['novayagazeta.ru', 'novayagazeta.eu']);

export function isNovayaGazetaUrl(raw: string): boolean {
  const domain = getSourceDomain(raw);

  return Boolean(domain && NOVAYA_GAZETA_HOSTS.has(domain));
}

/**
 * Recovers a publication date from the Novaya Gazeta path convention
 * `/articles/YYYY/MM/DD/...`. A date is returned only when every component is
 * a real calendar date. No date is inferred for other hosts.
 */
export function publishedDateFromUrl(raw: string): string | null {
  if (!isNovayaGazetaUrl(raw)) return null;

  try {
    const path = new URL(raw).pathname;
    const match = path.match(/\/(20\d{2})\/(\d{2})\/(\d{2})(?:\/|$)/);

    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return date.toISOString();
  } catch {
    return null;
  }
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b, c] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const lower = address.toLowerCase().replace(/^\[|\]$/g, '');

  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(lower)) return true;
  if (lower.startsWith('ff')) return true;

  // IPv4-mapped IPv6, including hexadecimal forms such as ::ffff:7f00:1.
  if (lower.startsWith('::ffff:')) return true;

  return false;
}

function isPrivateAddress(address: string): boolean {
  const version = net.isIP(address);

  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);

  return true;
}

function assertSafeHostnameSyntax(hostname: string): void {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (!host) throw new BrainUrlError('host_missing');

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home') ||
    host.endsWith('.lan') ||
    host === 'metadata.google.internal'
  ) {
    throw new BrainUrlError('private_host');
  }
}

/**
 * Validates a URL and resolves its DNS records. Every redirect target must be
 * checked again before it is fetched.
 */
export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BrainUrlError('url_invalid');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BrainUrlError('protocol_unsupported');
  }

  if (parsed.username || parsed.password) {
    throw new BrainUrlError('credentials_forbidden');
  }

  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    throw new BrainUrlError('port_forbidden');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  assertSafeHostnameSyntax(hostname);

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new BrainUrlError('private_host');
    return parsed;
  }

  let addresses: Array<{ address: string }>;

  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new BrainUrlError('dns_failed');
  }

  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new BrainUrlError('private_host');
  }

  return parsed;
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
};

export type SafeFetchResult = {
  url: string;
  html: string;
  status: number;
  contentType: string;
  bytes: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 3_000_000;
const DEFAULT_MAX_REDIRECTS = 5;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function charsetFromContentType(contentType: string): string | null {
  const match = /charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType);
  return match ? match[1].trim().toLowerCase() : null;
}

function sniffCharset(bytes: Uint8Array): string | null {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
  const meta = /<meta[^>]+charset\s*=\s*["']?([a-z0-9_-]+)/i.exec(head);
  return meta ? meta[1].toLowerCase() : null;
}

function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const charset = charsetFromContentType(contentType) || sniffCharset(bytes) || 'utf-8';

  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

/**
 * Fetches an HTML page with SSRF protection, redirect re-validation, a hard
 * byte cap and a per-hop timeout.
 */
export async function fetchHtmlSafely(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let current = await assertSafePublicUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    let response: Response;

    try {
      response = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        headers: {
          'User-Agent': options.userAgent || BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
      throw new BrainUrlError(
        name === 'TimeoutError' || name === 'AbortError' ? 'fetch_timeout' : 'fetch_failed'
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');

      if (!location) throw new BrainUrlError('redirect_without_location');

      current = await assertSafePublicUrl(new URL(location, current).toString());
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new BrainUrlError(
        `http_status_${response.status}`,
        retryAfterSeconds(response.headers.get('retry-after'))
      );
    }

    const contentType = response.headers.get('content-type') || '';

    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new BrainUrlError('unsupported_content_type');
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);

    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new BrainUrlError('response_too_large');
    }

    const reader = response.body?.getReader();

    if (!reader) throw new BrainUrlError('response_empty');

    const parts: Uint8Array[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;
      if (!value) continue;

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new BrainUrlError('response_too_large');
      }

      parts.push(value);
    }

    const merged = new Uint8Array(total);
    let offset = 0;

    for (const part of parts) {
      merged.set(part, offset);
      offset += part.byteLength;
    }

    return {
      url: current.toString(),
      html: decodeHtml(merged, contentType),
      status: response.status,
      contentType,
      bytes: total,
    };
  }

  throw new BrainUrlError('too_many_redirects');
}
