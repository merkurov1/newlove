/** @jest-environment node */

jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: any[]) => any) => (...args: any[]) => fn(...args),
  revalidateTag: jest.fn(),
  revalidatePath: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

import { createClient } from '@supabase/supabase-js';
import { loadFlowItemsPage } from '../items-cash';

const mockedCreateClient = createClient as jest.Mock;

type Row = Record<string, unknown>;

function row(overrides: Row = {}): Row {
  return {
    id: 'item-1',
    title: null,
    slug: 'item-1',
    lang: 'ru',
    type: 'note',
    status: 'published',
    visibility: 'public',
    body_md: 'Заголовок из тела\n\nОсновной текст.',
    published_at: '2026-11-20T10:00:00.000Z',
    created_at: '2026-11-20T09:00:00.000Z',
    updated_at: '2026-11-20T11:00:00.000Z',
    source_url: null,
    metadata: {},
    bluesky_uri: null,
    telegram_message_id: null,
    ...overrides,
  };
}

/**
 * Minimal PostgREST-shaped double. `eq` filters are actually applied so tests
 * can prove that hidden drafts never reach the loader.
 */
function fakeSupabase(rows: Row[], error: { message: string } | null = null) {
  const eqCalls: Array<[string, unknown]> = [];

  const chain: any = {
    select: () => chain,
    eq: (key: string, value: unknown) => {
      eqCalls.push([key, value]);
      return chain;
    },
    order: () => chain,
    range: (from: number, to: number) => {
      if (error) return Promise.resolve({ data: null, error, count: null });

      const filtered = rows.filter((item) =>
        eqCalls.every(([key, value]) => item[key] === value)
      );

      return Promise.resolve({
        data: filtered.slice(from, to + 1),
        error: null,
        count: filtered.length,
      });
    },
  };

  return {
    eqCalls,
    supabase: { from: jest.fn(() => chain) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('loadFlowItemsPage', () => {
  it('serves published public materials in both languages with normalized fields', async () => {
    const fake = fakeSupabase([
      row({ id: 'ru-1', lang: 'ru', title: 'Русская заметка' }),
      row({ id: 'en-1', lang: 'en', title: 'English note' }),
      row({
        id: 'hidden-1',
        lang: 'ru',
        visibility: 'hidden',
        title: 'Hidden',
      }),
      row({
        id: 'draft-1',
        lang: 'en',
        status: 'draft',
        title: 'Draft',
      }),
    ]);
    mockedCreateClient.mockReturnValue(fake.supabase);

    const result = await loadFlowItemsPage(10, 0);

    expect(result.items.map((item) => item.id)).toEqual(['ru-1', 'en-1']);
    expect(result.items.map((item) => item.language)).toEqual(['ru', 'en']);
    expect(result.total).toBe(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextOffset).toBe(2);

    // Publication, visibility and language rules: the shared list is public
    // and keeps both languages; it is never narrowed to the UI language.
    expect(fake.eqCalls).toEqual(
      expect.arrayContaining([
        ['status', 'published'],
        ['visibility', 'public'],
      ])
    );
    expect(fake.eqCalls.map(([key]) => key)).not.toContain('lang');

    // The API route used to add these fields after reading the cache. The
    // shared loader now guarantees them for every caller, including Journal.
    expect(result.items[0].title).toBe('Русская заметка');
    expect(result.items[0].contentType).toBeTruthy();
    expect(result.items[0].canonicalUrl).toContain('/flow/item-1');
  });

  it('returns an empty page without inventing entries for an empty catalogue', async () => {
    const fake = fakeSupabase([]);
    mockedCreateClient.mockReturnValue(fake.supabase);

    const result = await loadFlowItemsPage(10, 0);

    expect(result).toEqual({
      items: [],
      hasMore: false,
      total: 0,
      nextOffset: 0,
    });
  });

  it('propagates database failures instead of masking them as an empty list', async () => {
    const fake = fakeSupabase([], { message: 'connection refused' });
    mockedCreateClient.mockReturnValue(fake.supabase);

    await expect(loadFlowItemsPage(10, 0)).rejects.toThrow(
      'Failed to load Flow items: connection refused'
    );
  });
});
