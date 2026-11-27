/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

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

jest.mock('@supabase/supabase-js', () => {
  const actual = jest.requireActual('@supabase/supabase-js') as Record<string, unknown>;
  return {
    ...actual,
    createClient: jest.fn(),
  };
});

const supabaseServer = require('@/lib/supabase/server') as {
  createClient: jest.Mock;
};
const supabaseJs = require('@supabase/supabase-js') as {
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
  AuthenticationError: new (message?: string) => Error & { code?: string };
  getCurrentUser: () => Promise<unknown>;
  isAuthenticationError: (error: unknown) => boolean;
  requireAdmin: () => Promise<{ id: string; role: string }>;
  requireAdminFromRequest: (request?: Request) => Promise<{ id: string; role: string }>;
};

type ProfileMap = Record<string, Record<string, unknown> | null>;

type ClientOptions = {
  user?: { id: string; email?: string } | null;
  authError?: unknown;
  profile?: Record<string, unknown> | null;
  profiles?: ProfileMap;
  profileError?: unknown;
};

function client({
  user = null,
  authError = null,
  profile = null,
  profiles = {},
  profileError = null,
}: ClientOptions) {
  return {
    auth: {
      getUser: jest.fn(async () => ({ data: { user }, error: authError })),
    },
    from: jest.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (Object.prototype.hasOwnProperty.call(profiles, table)) {
              return { data: profiles[table], error: null };
            }

            if (table === 'profiles') {
              return { data: null, error: null };
            }

            return { data: profile, error: profileError };
          },
        }),
      }),
    })),
  };
}

const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

function clearServiceRoleEnv() {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
}

function enableServiceRoleEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
}

describe('serverAuth error classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearServiceRoleEnv();
  });

  afterEach(() => {
    if (originalServiceRole === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
    }

    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }
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
      profileSource: 'users',
    });
    expect(logger.logSecurityEvent).not.toHaveBeenCalled();
  });

  it('accepts an administrator role with legacy casing or whitespace', async () => {
    supabaseServer.createClient.mockResolvedValueOnce(
      client({
        user: { id: 'owner-1' },
        profile: { id: 'owner-1', role: ' admin ' },
      })
    );

    await expect(requireAdmin()).resolves.toMatchObject({
      id: 'owner-1',
      role: 'ADMIN',
    });
  });

  it('reads the role through the service-role client after validating the cookie session', async () => {
    // The session-bound client cannot read `users` (for example an RLS policy
    // regression), but the authenticated user id is valid and the service-role
    // profile read still proves the owner has ADMIN.
    enableServiceRoleEnv();
    const sessionClient = client({
      user: { id: 'owner-1' },
      profileError: { message: 'permission denied for table users' },
    });
    const serviceClient = client({
      profile: { id: 'owner-1', role: 'ADMIN' },
    });

    supabaseServer.createClient.mockResolvedValueOnce(sessionClient);
    supabaseJs.createClient.mockReturnValueOnce(serviceClient);

    await expect(requireAdmin()).resolves.toMatchObject({
      id: 'owner-1',
      role: 'ADMIN',
      profileSource: 'users',
    });
    expect(serviceClient.from).toHaveBeenCalledWith('users');
  });

  it('falls back to the legacy profiles table only when users has no row', async () => {
    supabaseServer.createClient.mockResolvedValueOnce(
      client({
        user: { id: 'owner-1' },
        profiles: {
          users: null,
          profiles: { id: 'owner-1', role: 'ADMIN' },
        },
      })
    );

    await expect(requireAdmin()).resolves.toMatchObject({
      id: 'owner-1',
      role: 'ADMIN',
      profileSource: 'profiles',
    });
  });

  it('throws a classified authentication error for an anonymous visitor', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    supabaseServer.createClient.mockResolvedValueOnce(
      client({ authError: { message: 'Auth session missing!' } })
    );

    const error = (await requireAdmin().catch((caught) => caught)) as Error & {
      code?: string;
    };

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(isAuthenticationError(error)).toBe(true);
    expect(error.code).toBe('auth_session_missing');
    expect(logger.logSecurityEvent).toHaveBeenCalledWith(
      'auth_denied',
      'low',
      expect.objectContaining({ reason: 'session', authenticated: false })
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

    const error = (await requireAdmin().catch((caught) => caught)) as Error & {
      code?: string;
    };

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(isAuthenticationError(error)).toBe(true);
    expect(error.code).toBe('auth_admin_required');
    expect(logger.logSecurityEvent).toHaveBeenCalledWith(
      'auth_denied',
      'low',
      expect.objectContaining({
        reason: 'admin',
        authenticated: true,
        role: 'USER',
      })
    );
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

      const error = await requireAdminFromRequest(request).catch((caught) => caught);

      expect(error).toBeInstanceOf(AuthenticationError);
      expect(isAuthenticationError(error)).toBe(true);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      process.env.ADMIN_API_SECRET = previous;
      errorSpy.mockRestore();
    }
  });
});
