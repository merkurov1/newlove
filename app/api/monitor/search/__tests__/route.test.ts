/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => undefined),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
}));

const { POST } = require('../route') as { POST: (request: Request) => Promise<Response> };
const auth = require('@/lib/serverAuth') as { requireAdminFromRequest: jest.Mock };

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/monitor/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/monitor/search security boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => new Response('', { status: 503 })) as typeof fetch;
    delete process.env.DEEPSEEK_API_KEY;
  });

  it('rejects non-admin callers before external fetching', async () => {
    auth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await POST(request({ artist: 'Rothko' }));

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects oversized or invalid input', async () => {
    expect((await POST(request({ artist: '' }))).status).toBe(400);
    expect((await POST(request({ artist: 'x'.repeat(121) }))).status).toBe(400);
    expect((await POST(request({ artist: 'Rothko', source: 'https://evil.example' }))).status).toBe(
      400
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns no internal diagnostics and bounds provider calls', async () => {
    const response = await POST(request({ artist: 'Rothko', source: 'invaluable' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload._debug).toBeUndefined();
    expect(global.fetch).toHaveBeenCalled();
    expect((global.fetch as jest.Mock).mock.calls[0][1]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});
