/**
 * Deterministic traffic classification.
 *
 * GA4/Umami cannot know that a session belongs to the owner. This module only
 * classifies paths that are structurally internal. It does not pretend to
 * identify every owner session; the internal Pierrot identity is used
 * separately for conversations.
 */

export type TrafficClass = 'public' | 'owner_admin' | 'automated' | 'unknown';

const ADMIN_PREFIXES = [
  '/admin',
  '/pierrot',
  '/dashboard',
  '/studio',
  '/office',
];

const AUTOMATED_PREFIXES = [
  '/api/',
  '/_next/',
  '/static/',
  '/assets/_next/',
  '/.well-known/',
  '/robots.txt',
  '/sitemap',
  '/health',
  '/cdn-cgi/',
  '/xmlrpc.php',
  '/wp-admin',
  '/wp-login',
];

const AUTOMATED_PATTERNS = [
  /[?&](preview|draft|test|debug)=/i,
  /\/(preview|draft|test)\//i,
  /\/__/,
];

function normalizePath(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value, 'https://merkurov.love');
    return url.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  } catch {
    return value.toLowerCase().split('?')[0].replace(/\/+$/, '') || '/';
  }
}

export function classifyTrafficPath(value: string | null | undefined): TrafficClass {
  const path = normalizePath(value);
  if (!path) return 'unknown';

  if (AUTOMATED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))) {
    return 'automated';
  }
  if (AUTOMATED_PATTERNS.some((pattern) => pattern.test(value || path))) {
    return 'automated';
  }
  if (ADMIN_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return 'owner_admin';
  }

  return 'public';
}

export function isInternalPath(value: string | null | undefined): boolean {
  const classification = classifyTrafficPath(value);
  return classification === 'owner_admin' || classification === 'automated';
}

export function isPublicPath(value: string | null | undefined): boolean {
  return classifyTrafficPath(value) === 'public';
}
