/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logSecurityEvent: jest.fn(),
  log: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

const supabaseServer = require('@/lib/supabase/server') as {
  createClient: jest.Mock;
};
const logger = require('@/lib/logger') as {
  logSecurityEvent: jest.Mock;
};
const {
  AuthenticationError,
  getCurrentUser,
  isAuthenticationError,
  requireAdmin,
  requireAdminFromRequest,
} = require('@/lib/serverAuth') as {
  AuthenticationError: new (message?: string) => Error;
  getCurrentUser: () => Promise<unknown>;
  isAuthenticationError: (error: unknown) => boolean;
  requireAdmin: () => Promise<{ id: string; role: string }>;
  requireAdminFromRequest: (
    request?: Request
  ) => Promise<{ id: string; role: string }>;
};

type ClientOptions = {
  user?: { id: string; email?: string } | null;
  authError?: unknown;
  profile?: Record<string, unknown> | null;
  profileError?: unknown;
};

function client({
  user = null,
  authError = null,
  profile = null,
  profileError = null,
}: ClientOptions) {
  return {
    auth: {
      getUser: jest.fn(async () => ({ data: { user }, error: authError })),
    },
    from: jest.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: profile, error: profileError }),
        }),
      }),
    })),
  };
}

describe('serverAuth error classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves an authenticated owner', async () => {
    supabaseServer.createClient.mockResolvedValueOnce(
      client({
        user: { id: 'owner-1', email: 'owner@example.com' },
        profile: { id: 'owner-1', role: 'ADMIN' },
      })
    );

    await expect(requireAdmin()).resolves.toMatchObject({
      id: 'owner-1',
      role: 'ADMIN',
    });
    expect(logger.logSecurityEvent).not.toHaveBeenCalled();
  });

  it('throws a classified authentication error for an anonymous visitor', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    supabaseServer.createClient.mockResolvedValueOnce(
      client({ authError: { message: 'Auth session missing!' } })
    );

    const error = await requireAdmin().catch((caught) => caught);

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(isAuthenticationError(error)).toBe(true);
    expect(logger.logSecurityEvent).toHaveBeenCalledWith(
      'auth_denied',
      'low',
      expect.objectContaining({ reason: 'admin' })
    );
    // Expected denials are security events, not application crashes.
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('rejects an authenticated non-admin as an authorization denial', async () => {
    supabaseServer.createClient.mockResolvedValueOnce(
      client({
        user: { id: 'reader-1' },
        profile: { id: 'reader-1', role: 'USER' },
      })
    );

    const error = await requireAdmin().catch((caught) => caught);

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(isAuthenticationError(error)).toBe(true);
  });

  it('does not classify a profile database failure as authentication', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    supabaseServer.createClient.mockResolvedValueOnce(
      client({
        user: { id: 'owner-1' },
        profileError: { message: 'database unavailable' },
      })
    );

    const error = await requireAdmin().catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(isAuthenticationError(error)).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    expect(logger.logSecurityEvent).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('keeps getCurrentUser best-effort for optional auth surfaces', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    supabaseServer.createClient.mockResolvedValueOnce(
      client({
        user: { id: 'owner-1' },
        profileError: { message: 'database unavailable' },
      })
    );

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('accepts the dedicated admin secret', async () => {
    const previous = process.env.ADMIN_API_SECRET;
    process.env.ADMIN_API_SECRET = 'super-secret-value';
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const request = new Request('http://localhost/api/admin/items/list', {
        headers: { 'x-admin-secret': 'super-secret-value' },
      });

      await expect(requireAdminFromRequest(request)).resolves.toMatchObject({
        id: 'system-admin',
        role: 'ADMIN',
      });
      expect(supabaseServer.createClient).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      process.env.ADMIN_API_SECRET = previous;
      errorSpy.mockRestore();
    }
  });

  it('does not grant admin access for an invalid admin secret', async () => {
    const previous = process.env.ADMIN_API_SECRET;
    process.env.ADMIN_API_SECRET = 'super-secret-value';
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    supabaseServer.createClient.mockResolvedValueOnce(
      client({ authError: { message: 'Auth session missing!' } })
    );

    try {
      const request = new Request('http://localhost/api/admin/items/list', {
        headers: { 'x-admin-secret': 'wrong-secret-value' },
      });

      const error = await requireAdminFromRequest(request).catch(
        (caught) => caught
      );

      expect(error).toBeInstanceOf(AuthenticationError);
      expect(isAuthenticationError(error)).toBe(true);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      process.env.ADMIN_API_SECRET = previous;
      errorSpy.mockRestore();
    }
  });
});
