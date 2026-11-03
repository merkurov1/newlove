/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(),
  getCurrentUser: jest.fn(),
}));

const auth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: { mockResolvedValue: (v: unknown) => void; mockRejectedValue: (v: unknown) => void };
  getCurrentUser: { mockResolvedValue: (v: unknown) => void };
};
const { GET } = require('../route') as { GET: (request: Request) => Promise<Response> };

function request() {
  return new Request('http://localhost/api/test-auth');
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.requireAdminFromRequest.mockResolvedValue({ id: 'admin', role: 'ADMIN' });
  auth.getCurrentUser.mockResolvedValue({ id: 'admin', role: 'ADMIN' });
});

describe('GET /api/test-auth', () => {
  it('returns 401 without authentication', async () => {
    auth.requireAdminFromRequest.mockRejectedValue(new Error('Unauthorized'));
    auth.getCurrentUser.mockResolvedValue(null);

    expect((await GET(request())).status).toBe(401);
  });

  it('returns 403 for an ordinary authenticated user', async () => {
    auth.requireAdminFromRequest.mockRejectedValue(new Error('Unauthorized: Admin access required'));
    auth.getCurrentUser.mockResolvedValue({ id: 'user', role: 'USER' });

    expect((await GET(request())).status).toBe(403);
  });

  it('returns only minimal diagnostics for an administrator', async () => {
    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, role: 'ADMIN' });
    expect(JSON.stringify(json)).not.toContain('email');
    expect(JSON.stringify(json)).not.toContain('token');
    expect(JSON.stringify(json)).not.toContain('cookie');
  });
});
