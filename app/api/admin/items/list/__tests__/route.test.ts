/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

const serverAuth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: jest.Mock;
};
const supabaseServer = require('@/lib/supabase/server') as {
  createClient: jest.Mock;
};
const { AuthenticationError } = require('@/lib/auth/errors') as {
  AuthenticationError: new (message?: string) => Error;
};
const { GET } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
};

type QueryResult = { data: unknown; error: unknown };

function store(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = chain;
  builder.order = chain;
  builder.limit = jest.fn(async () => result);

  return { from: jest.fn(() => builder) };
}

function request() {
  return new Request('http://localhost/api/admin/items/list');
}

describe('GET /api/admin/items/list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 for an anonymous request without querying the database', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(
      new AuthenticationError('Unauthorized: Admin access required')
    );

    const response = await GET(request());
    const body = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ success: false, error: 'Unauthorized' });
    expect(supabaseServer.createClient).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('returns items for an authenticated owner', async () => {
    const items = [
      {
        id: 'item-1',
        title: 'Published story',
        status: 'published',
        updated_at: '2026-11-25T10:00:00.000Z',
      },
    ];
    serverAuth.requireAdminFromRequest.mockResolvedValueOnce({
      id: 'owner-1',
      role: 'ADMIN',
    });
    supabaseServer.createClient.mockResolvedValueOnce(
      store({ data: items, error: null })
    );

    const response = await GET(request());
    const body = (await response.json()) as {
      success: boolean;
      items: unknown[];
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, items });
    expect(serverAuth.requireAdminFromRequest).toHaveBeenCalledWith(
      expect.any(Request)
    );
  });

  it('returns 500 when the database query fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    serverAuth.requireAdminFromRequest.mockResolvedValueOnce({
      id: 'owner-1',
      role: 'ADMIN',
    });
    supabaseServer.createClient.mockResolvedValueOnce(
      store({ data: null, error: { message: 'database unavailable' } })
    );

    const response = await GET(request());
    const body = (await response.json()) as {
      success: boolean;
      error: string;
    };

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: 'Failed to load items.',
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('returns 500 when the Supabase client cannot be created', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    serverAuth.requireAdminFromRequest.mockResolvedValueOnce({
      id: 'owner-1',
      role: 'ADMIN',
    });
    supabaseServer.createClient.mockRejectedValueOnce(
      new Error('Missing env var: SUPABASE_SERVICE_ROLE_KEY')
    );

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('returns 500 for a non-authentication failure during the auth check', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(
      new Error('Failed to load user profile: database unavailable')
    );

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(supabaseServer.createClient).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
