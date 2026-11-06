/** @jest-environment node */

import { beforeEach, describe, expect, it } from '@jest/globals';

jest.mock('@supabase/supabase-js', () => {
  let result: { data: unknown; error: unknown } = {
    data: { slug: 'тест-публикация' },
    error: null,
  };
  let fromCalls = 0;
  const eqCalls: Array<[unknown, unknown]> = [];

  const query = {
    select: () => query,
    eq: (column: unknown, value: unknown) => {
      eqCalls.push([column, value]);
      return query;
    },
    maybeSingle: async () => result,
  };

  return {
    createClient: () => ({
      from: () => {
        fromCalls += 1;
        return query;
      },
    }),
    __setResult: (value: { data: unknown; error: unknown }) => {
      result = value;
    },
    __reset: () => {
      fromCalls = 0;
      eqCalls.length = 0;
    },
    __calls: () => ({ fromCalls, eqCalls: [...eqCalls] }),
  };
});

import { GET } from '../route';

const mockSupabase = jest.requireMock('@supabase/supabase-js') as {
  __setResult: (value: { data: unknown; error: unknown }) => void;
  __reset: () => void;
  __calls: () => { fromCalls: number; eqCalls: Array<[unknown, unknown]> };
};

const ID = '18933270-d9d5-45f8-8255-8e5fb84d3832';

function context(id = ID) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mockSupabase.__reset();
  mockSupabase.__setResult({ data: { slug: 'тест-публикация' }, error: null });
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
});

describe('short Flow redirect', () => {
  it('redirects a published item id to the canonical slug URL', async () => {
    const response = await GET(new Request('https://www.merkurov.love/flow/i/' + ID), context());

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://www.merkurov.love/flow/%D1%82%D0%B5%D1%81%D1%82-%D0%BF%D1%83%D0%B1%D0%BB%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F'
    );
    expect(mockSupabase.__calls().fromCalls).toBe(1);
    expect(mockSupabase.__calls().eqCalls).toEqual([
      ['id', ID],
      ['status', 'published'],
      ['visibility', 'public'],
    ]);
  });

  it('rejects an invalid id without touching the database', async () => {
    const response = await GET(
      new Request('https://www.merkurov.love/flow/i/not-a-uuid'),
      context('not-a-uuid')
    );

    expect(response.status).toBe(404);
    expect(mockSupabase.__calls().fromCalls).toBe(0);
  });

  it('returns 404 for a missing or non-public item', async () => {
    mockSupabase.__setResult({ data: null, error: null });

    const response = await GET(new Request('https://www.merkurov.love/flow/i/' + ID), context());

    expect(response.status).toBe(404);
  });
});
