/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => {
  class AuthenticationError extends Error {
    readonly status = 401;
    readonly code: string;
    readonly reason: string | null;

    constructor(message = 'Unauthorized', options: { code?: string; reason?: string | null } = {}) {
      super(message);
      this.name = 'AuthenticationError';
      this.code = options.code ?? 'auth_session_missing';
      this.reason = options.reason ?? null;
    }
  }

  return {
    AuthenticationError,
    isAuthenticationError: (error: unknown) => error instanceof AuthenticationError,
    requireAdminFromRequest: jest.fn(),
  };
});

const serverAuth = require('@/lib/serverAuth') as {
  AuthenticationError: new (
    message?: string,
    options?: { code?: string; reason?: string | null }
  ) => Error;
  requireAdminFromRequest: jest.Mock;
};
const route = require('../route') as {
  GET: (request: Request) => Promise<Response>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('admin auth diagnostics route', () => {
  it('reports the successful API auth path without leaking credentials', async () => {
    serverAuth.requireAdminFromRequest.mockResolvedValue({
      id: 'owner-1',
      role: 'ADMIN',
      authMethod: 'session',
      profileSource: 'users',
    });

    const response = await route.GET(
      new Request('http://localhost/api/admin/auth-diagnostics', {
        headers: { cookie: 'sb-test-auth-token=secret-value' },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      authorized: true,
      role: 'ADMIN',
      authMethod: 'session',
      profileSource: 'users',
    });
    expect(body.request).toMatchObject({
      hasCookieHeader: true,
      hasSupabaseSessionCookie: true,
    });
    expect(JSON.stringify(body)).not.toContain('secret-value');
  });

  it('returns 403 when the session is valid but the account is not an admin', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValue(
      new serverAuth.AuthenticationError('Unauthorized: Admin access required', {
        code: 'auth_admin_required',
        reason: 'admin',
      })
    );

    const response = await route.GET(new Request('http://localhost/api/admin/auth-diagnostics'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      ok: false,
      authenticated: true,
      authorized: false,
      code: 'auth_admin_required',
    });
  });

  it('returns 401 when no usable session reached the API route', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValue(
      new serverAuth.AuthenticationError('Unauthorized: Admin access required', {
        code: 'auth_session_missing',
        reason: 'session',
      })
    );

    const response = await route.GET(new Request('http://localhost/api/admin/auth-diagnostics'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      ok: false,
      authenticated: false,
      authorized: false,
      code: 'auth_session_missing',
    });
  });
});
