/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockIdentity = jest.fn();
const mockClaim = jest.fn();
const mockStatus = jest.fn();

jest.mock('@/lib/vigil/identity', () => ({
  resolveVigilIdentity: (...args: unknown[]) => mockIdentity(...args),
}));

jest.mock('@/lib/vigil/claim', () => ({
  claimVigilSpark: (...args: unknown[]) => mockClaim(...args),
  getVigilSparkStatus: (...args: unknown[]) => mockStatus(...args),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: (table: string) => {
      if (table !== 'vigil_hearts') throw new Error(`Unexpected table ${table}`);

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 1, owner_name: 'Anna', last_lit_at: '2026-11-04T12:00:00.000Z' },
              error: null,
            }),
          }),
        }),
      };
    },
  })),
}));

const { GET, POST } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
};

const identity = {
  key: 'tg:100200300',
  userId: '100200300',
  displayName: 'Anna',
  source: 'telegram' as const,
};

function makeRequest(body: Record<string, unknown> = { id: 1 }) {
  return new Request('http://localhost/api/vigil/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIdentity.mockResolvedValue(identity);
  mockClaim.mockResolvedValue({
    allowed: true,
    lastSparkAt: '2026-11-04T12:00:00.000Z',
  });
});

describe('/api/vigil/claim', () => {
  it('rejects an unauthenticated claim without writing a spark', async () => {
    mockIdentity.mockResolvedValue(null);

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('returns 429 with the server-calculated remaining time', async () => {
    mockClaim.mockResolvedValue({
      allowed: false,
      lastSparkAt: '2026-11-04T11:00:00.000Z',
      remainingMs: 23 * 60 * 60 * 1000,
      remainingLabel: '23h',
    });

    const response = await POST(makeRequest());
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('82800');
    expect(payload).toMatchObject({
      error: 'cooldown',
      remainingMs: 23 * 60 * 60 * 1000,
      remainingLabel: '23h',
    });
  });

  it('returns the verified identity result and never trusts a client name', async () => {
    const response = await POST(
      makeRequest({ id: 1, name: 'Mallory' })
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(mockClaim).toHaveBeenCalledWith(
      expect.anything(),
      identity,
      1,
      null
    );
  });

  it('rejects invalid heart ids and oversized intentions', async () => {
    expect((await POST(makeRequest({ id: 99 }))).status).toBe(400);
    expect(
      (
        await POST(
          makeRequest({ id: 1, intention: 'x'.repeat(281) })
        )
      ).status
    ).toBe(400);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('reports anonymous status without requiring a spark', async () => {
    mockIdentity.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/vigil/claim')
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      authenticated: false,
      canSpark: false,
    });
  });
});
