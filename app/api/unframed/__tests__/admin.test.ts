/** @jest-environment node */

import { beforeEach, afterAll, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockResolvedValue: (value: unknown) => void;
};

const mockCookieSet = jest.fn() as unknown as MockFn;

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({ set: mockCookieSet })),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
}));

const { POST } = require('../admin/route') as {
  POST: (request: Request) => Promise<Response>;
};

const ORIGINAL_ADMIN_SECRET = process.env.ADMIN_SECRET_KEY;
const ORIGINAL_JWT_SECRET = process.env.NEXT_JWT_SECRET;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/unframed/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADMIN_SECRET_KEY = 'admin-secret-for-tests';
  process.env.NEXT_JWT_SECRET = 'x'.repeat(48);
});

afterAll(() => {
  if (ORIGINAL_ADMIN_SECRET === undefined) delete process.env.ADMIN_SECRET_KEY;
  else process.env.ADMIN_SECRET_KEY = ORIGINAL_ADMIN_SECRET;

  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.NEXT_JWT_SECRET;
  else process.env.NEXT_JWT_SECRET = ORIGINAL_JWT_SECRET;
});

describe('POST /api/unframed/admin', () => {
  it('issues an httpOnly admin cookie for the correct key', async () => {
    const response = await POST(makeRequest({ key: 'admin-secret-for-tests' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mockCookieSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'unframed_admin',
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      })
    );
  });

  it('rejects an incorrect key', async () => {
    const response = await POST(makeRequest({ key: 'wrong' }));

    expect(response.status).toBe(401);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it('returns 503 when the admin secret is not configured', async () => {
    delete process.env.ADMIN_SECRET_KEY;

    const response = await POST(makeRequest({ key: 'anything' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Administrative access is temporarily unavailable',
    });
  });

  it('returns 401 for a malformed JSON body instead of crashing', async () => {
    const response = await POST(
      new Request('http://localhost/api/unframed/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not-json',
      })
    );

    expect(response.status).toBe(401);
  });
});
