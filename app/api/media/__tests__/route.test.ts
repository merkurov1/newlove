/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(),
  getCurrentUser: jest.fn(),
  getServerSupabaseClient: jest.fn(),
}));

const auth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: { mockResolvedValue: (v: unknown) => void; mockRejectedValue: (v: unknown) => void };
  getCurrentUser: { mockResolvedValue: (v: unknown) => void };
  getServerSupabaseClient: { mockReturnValue: (v: unknown) => void; mockImplementation: (fn: () => unknown) => void };
};
const { GET } = require('../route') as { GET: (request: Request) => Promise<Response> };

function request() {
  return new Request('http://localhost/api/media');
}

function serviceStore(result: { data?: unknown; error?: unknown }) {
  return {
    storage: {
      from: jest.fn(() => ({
        list: jest.fn(async () => result),
      })),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.requireAdminFromRequest.mockResolvedValue({ id: 'admin', role: 'ADMIN' });
  auth.getCurrentUser.mockResolvedValue({ id: 'admin', role: 'ADMIN' });
});

describe('GET /api/media', () => {
  it('returns 401 for an anonymous request and never touches service role storage', async () => {
    auth.requireAdminFromRequest.mockRejectedValue(new Error('Unauthorized'));
    auth.getCurrentUser.mockResolvedValue(null);

    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(auth.getServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('returns 403 for an authenticated non-admin', async () => {
    auth.requireAdminFromRequest.mockRejectedValue(new Error('Unauthorized: Admin access required'));
    auth.getCurrentUser.mockResolvedValue({ id: 'user', role: 'USER' });

    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(auth.getServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('lists media only after admin authorization', async () => {
    auth.getServerSupabaseClient.mockReturnValue(
      serviceStore({
        data: [{ name: 'image.jpg', id: '1', size: 10, updated_at: '2026-11-03' }],
        error: null,
      })
    );

    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.files).toHaveLength(1);
    expect(auth.getServerSupabaseClient).toHaveBeenCalledWith({ useServiceRole: true });
  });

  it('does not hide a storage failure as an empty successful response', async () => {
    auth.getServerSupabaseClient.mockReturnValue(
      serviceStore({ data: null, error: { message: 'storage down' } })
    );

    const response = await GET(request());
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.files).toBeUndefined();
  });

  it('returns 503 when service-role configuration is missing', async () => {
    auth.getServerSupabaseClient.mockImplementation(() => {
      throw new Error('Missing Supabase service-role environment variables.');
    });

    const response = await GET(request());
    expect(response.status).toBe(503);
  });
});
