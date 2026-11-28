import { NextResponse } from 'next/server';

import { isAuthenticationError } from '@/lib/auth/errors';
import { requireAdminFromRequest, type AuthenticatedUser } from '@/lib/serverAuth';
import { InstantViewAuthError } from '@/lib/telegram/instantViewAuth';
import { InstantViewStorageError } from '@/lib/telegram/instantViewSessionStore';

export const INSTANT_VIEW_ADMIN_NO_STORE = {
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'X-Robots-Tag': 'noindex, nofollow',
};

export function instantViewJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: INSTANT_VIEW_ADMIN_NO_STORE,
  });
}

export async function requireInstantViewOwner(request: Request): Promise<AuthenticatedUser> {
  return requireAdminFromRequest(request);
}

export function instantViewErrorResponse(error: unknown) {
  if (isAuthenticationError(error)) {
    return instantViewJson({ error: 'Unauthorized' }, 401);
  }

  if (error instanceof InstantViewStorageError) {
    return instantViewJson(
      {
        error: 'storage_unavailable',
        message:
          'Session storage is unavailable. The private server-side settings table or service role is not configured.',
      },
      503
    );
  }

  if (error instanceof InstantViewAuthError) {
    return instantViewJson({ error: error.code, message: error.message }, 400);
  }

  // Never include provider responses, cookies, phone numbers or temp sessions.
  console.error(
    '[admin-instant-view]',
    error instanceof Error ? error.name : 'Unknown admin Instant View error'
  );

  return instantViewJson({ error: 'internal_error' }, 500);
}

export function requiresJsonRequest(request: Request): boolean {
  const type = request.headers.get('content-type') || '';
  return type.toLowerCase().startsWith('application/json');
}

export function invalidJsonRequest() {
  return instantViewJson(
    { error: 'invalid_request', message: 'Expected an application/json request.' },
    415
  );
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
