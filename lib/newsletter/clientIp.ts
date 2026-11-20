import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/newsletter/clientIp');

type HeaderSource = {
  get(name: string): string | null;
};

function firstValidIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.split(',')[0]?.trim().replace(/^\[|\]$/g, '') || '';
  if (!candidate || candidate.length > 64) return null;
  // IPv4 or IPv6. Hostnames and malformed values are ignored.
  return /^[0-9a-fA-F:.]+$/.test(candidate) && (candidate.includes('.') || candidate.includes(':'))
    ? candidate
    : null;
}

function trustedProxyHops(): number {
  const parsed = Number.parseInt(process.env.TRUSTED_PROXY_HOPS || '1', 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(parsed, 10));
}

/**
 * Resolve the caller IP using only headers that the deployment edge is expected
 * to set. `x-forwarded-for` is parsed from the trusted end of the chain so a
 * client cannot pick its own bucket by prepending a value.
 *
 * Configure `TRUSTED_CLIENT_IP_HEADER` when the hosting provider uses a custom
 * header. `TRUSTED_PROXY_HOPS` defaults to 1 (the edge itself).
 */
export function getTrustedClientIp(headers: HeaderSource): string {
  const configuredHeader = (process.env.TRUSTED_CLIENT_IP_HEADER || '').trim().toLowerCase();

  if (configuredHeader) {
    const ip = firstValidIp(headers.get(configuredHeader));
    if (ip) return ip;
  }

  const onCloudflare =
    process.env.TRUSTED_PROXY_PROVIDER === 'cloudflare' || Boolean(process.env.CF_PAGES);
  if (onCloudflare) {
    const ip = firstValidIp(headers.get('cf-connecting-ip'));
    if (ip) return ip;
  }

  if (process.env.VERCEL) {
    const ip =
      firstValidIp(headers.get('x-vercel-forwarded-for')) ||
      firstValidIp(headers.get('x-real-ip'));
    if (ip) return ip;
  }

  const realIp = firstValidIp(headers.get('x-real-ip'));
  if (realIp) return realIp;

  const forwarded = headers.get('x-forwarded-for') || '';
  const parts = forwarded
    .split(',')
    .map((part) => part.trim().replace(/^\[|\]$/g, ''))
    .filter(Boolean);

  if (parts.length === 0) return 'unknown';

  const index = Math.max(0, parts.length - 1 - trustedProxyHops());
  return firstValidIp(parts[index]) || 'unknown';
}
