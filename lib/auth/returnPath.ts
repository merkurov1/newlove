/**
 * Login return paths are intentionally limited to same-origin internal routes.
 * This prevents an open redirect through ?next= or a stale stored value.
 */
export function safeLoginReturnPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (trimmed.includes('\\')) return null;
  if (trimmed.startsWith('/login')) return null;

  try {
    const resolved = new URL(trimmed, 'https://merkurov.local');
    if (resolved.origin !== 'https://merkurov.local') return null;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

export function loginReturnPathFromReferrer(
  referrer: string | null | undefined,
  origin: string | null | undefined
): string | null {
  if (!referrer || !origin) return null;

  try {
    const url = new URL(referrer);
    if (url.origin !== origin) return null;
    return safeLoginReturnPath(`${url.pathname}${url.search}${url.hash}`);
  } catch {
    return null;
  }
}

export function resolveLoginReturnPath(input: {
  requested?: string | null;
  stored?: string | null;
  referrer?: string | null;
  fallback?: string;
}): string {
  return (
    safeLoginReturnPath(input.requested) ||
    safeLoginReturnPath(input.stored) ||
    safeLoginReturnPath(input.referrer) ||
    safeLoginReturnPath(input.fallback) ||
    '/art-engine'
  );
}
