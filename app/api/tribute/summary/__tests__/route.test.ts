/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockResult: { data: unknown; error: unknown } = {
  data: [],
  error: null,
};

const mockEq = jest.fn();
const mockGte = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: (table: string) => {
      if (table !== 'tributes') throw new Error(`Unexpected table ${table}`);

      return {
        select: (columns: string) => {
          expect(columns).toBe('amount_cents');

          return {
            eq: (column: string, value: unknown) => {
              mockEq(column, value);

              return {
                gte: async (dateColumn: string, dateValue: string) => {
                  mockGte(dateColumn, dateValue);
                  return mockResult;
                },
              };
            },
          };
        },
      };
    },
  })),
}));

const { GET } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockResult.data = [
    { amount_cents: 2000 },
    { amount_cents: 500 },
    { amount_cents: null },
  ];
  mockResult.error = null;
});

describe('GET /api/tribute/summary', () => {
  it('sums only succeeded contributions for the last 24 hours', async () => {
    const response = await GET(new Request('http://localhost/api/tribute/summary'));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      totalCents: 2500,
      total: 25,
      count: 3,
      currency: 'usd',
    });
    expect(mockEq).toHaveBeenCalledWith('status', 'succeeded');
    expect(mockGte).toHaveBeenCalledWith('created_at', expect.any(String));
  });

  it('returns no donor or payment details', async () => {
    const response = await GET(new Request('http://localhost/api/tribute/summary'));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual(
      ['count', 'currency', 'since', 'total', 'totalCents'].sort()
    );
  });

  it('fails closed instead of returning a false total', async () => {
    mockResult.error = new Error('permission denied');

    const response = await GET(new Request('http://localhost/api/tribute/summary'));

    expect(response.status).toBe(500);
  });
});
