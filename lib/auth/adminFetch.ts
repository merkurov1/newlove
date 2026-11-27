'use client';

import { supabase } from '@/lib/supabase-browser';

/**
 * Authenticated fetch for owner-only admin routes.
 *
 * Admin pages are protected by the Supabase cookie session. A route handler
 * can still see an expired/missing cookie when a tab has been open for a long
 * time or when the cookie refresh only happens on a page navigation. In that
 * case `requireAdminFromRequest` answers 401 even though the page rendered for
 * the owner.
 *
 * This helper:
 *   - refreshes the browser session when the access token is close to expiry;
 *   - sends the access token as a Bearer credential, which the admin guard
 *     already verifies against the `users.role = 'ADMIN'` record;
 *   - keeps cookies enabled for the normal browser-session path;
 *   - retries exactly once after a forced refresh when the server answers 401.
 *
 * It never logs and never returns the access token. The token only travels in
 * the Authorization header of the request being made.
 */

export type AdminAuthSnapshot = {
  hasSession: boolean;
  email: string | null;
  expiresAtMs: number | null;
};

type BrowserSession = {
  access_token?: string;
  user?: { email?: string | null } | null;
  expires_at?: number | null;
} | null;

const REFRESH_WINDOW_MS = 60_000;

async function resolveSession(forceRefresh: boolean): Promise<BrowserSession> {
  try {
    const current = await supabase.auth.getSession();
    let session = (current.data?.session ?? null) as BrowserSession;

    if (!session) return null;

    const expiresAtMs = typeof session.expires_at === 'number' ? session.expires_at * 1000 : null;
    const expiresSoon = expiresAtMs !== null && expiresAtMs - Date.now() <= REFRESH_WINDOW_MS;

    if (!forceRefresh && !expiresSoon) return session;

    const refreshed = await supabase.auth.refreshSession();
    const next = (refreshed.data?.session ?? null) as BrowserSession;

    // A failed refresh must not discard a still-valid session; the caller may
    // still succeed through the cookie path.
    if (!refreshed.error && next) session = next;

    return session;
  } catch {
    // A browser auth failure must not replace the cookie path with a crash.
    return null;
  }
}

function requestHeaders(init: RequestInit, token?: string | null): Headers {
  const headers = new Headers(init.headers);

  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return headers;
}

export async function adminFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const session = await resolveSession(false);
  const token = typeof session?.access_token === 'string' ? session.access_token : null;

  const requestInit: RequestInit = {
    ...init,
    credentials: 'include',
    cache: init.cache ?? 'no-store',
    headers: requestHeaders(init, token),
  };

  const response = await fetch(input, requestInit);

  if (response.status !== 401) return response;

  const refreshed = await resolveSession(true);
  const retryToken = typeof refreshed?.access_token === 'string' ? refreshed.access_token : null;

  if (!retryToken) return response;

  return fetch(input, {
    ...init,
    credentials: 'include',
    cache: init.cache ?? 'no-store',
    headers: requestHeaders(init, retryToken),
  });
}

/** Redacted session diagnostics for the admin UI. Never returns a token. */
export async function readAdminAuthSnapshot(): Promise<AdminAuthSnapshot> {
  try {
    const session = await resolveSession(false);

    return {
      hasSession: Boolean(session?.access_token),
      email:
        typeof session?.user?.email === 'string' && session.user.email.trim()
          ? session.user.email.trim()
          : null,
      expiresAtMs: typeof session?.expires_at === 'number' ? session.expires_at * 1000 : null,
    };
  } catch {
    return { hasSession: false, email: null, expiresAtMs: null };
  }
}
