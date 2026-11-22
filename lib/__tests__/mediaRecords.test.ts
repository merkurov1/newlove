/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const state = globalThis as typeof globalThis & {
      __mediaTestError?: Error;
      __mediaTestClient?: unknown;
    };
    if (state.__mediaTestError) throw state.__mediaTestError;
    return state.__mediaTestClient;
  },
}));

import { publicRecords as localRecords, records as allLocalRecords } from '@/data/media';

const { getMediaRecords } = require('../mediaRecords') as {
  getMediaRecords: () => Promise<typeof localRecords>;
};

type MediaTestState = typeof globalThis & {
  __mediaTestError?: Error;
  __mediaTestClient?: unknown;
};

const state = globalThis as MediaTestState;

type Row = Record<string, unknown>;

function thenable(result: { data: unknown[]; error: null }) {
  const builder: Record<string, unknown> = {};

  for (const method of ['select', 'in', 'eq', 'neq', 'order', 'limit', 'is', 'not']) {
    builder[method] = () => builder;
  }

  builder.then = (resolve: (value: typeof result) => unknown) => resolve(result);
  return builder;
}

function clientWithMedia(rows: Row[] | null, error: { message: string } | null = null) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'media_archive_records') {
        return thenable({ data: rows || [], error: error as never });
      }

      return thenable({ data: [], error: null });
    }),
  };
}

function fallbackNovaya() {
  const record = localRecords.find((item) => item.url.startsWith('https://novayagazeta.ru/articles/'));
  if (!record) throw new Error('Expected a Novaya fallback record');
  return record;
}

let consoleError: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  delete state.__mediaTestClient;
  delete state.__mediaTestError;
  // Some cases intentionally exercise the database-unavailable fallback.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('getMediaRecords publication boundary', () => {
  it('uses the verified local archive when the database is unavailable', async () => {
    state.__mediaTestError = new Error('database unavailable');

    const records = await getMediaRecords();

    expect(records).toHaveLength(localRecords.length);
    expect(records.every((record) => Boolean(record.slug))).toBe(true);
  });

  it('keeps a local draft as history but never serves it as fallback', async () => {
    expect(allLocalRecords.length).toBe(localRecords.length + 1);

    state.__mediaTestError = new Error('database unavailable');
    const records = await getMediaRecords();

    expect(records.some((record) => record.status === 'draft')).toBe(false);
    expect(records.some((record) => record.title === 'Вечный зов')).toBe(false);
    expect(allLocalRecords.some((record) => record.title === 'Вечный зов')).toBe(true);
  });

  it('does not publish a database draft and suppresses an equivalent local fallback', async () => {
    const fallback = fallbackNovaya();
    const draftUrl = fallback.url.replace('https://', 'https://www.');

    state.__mediaTestClient = clientWithMedia([
        {
          id: 'draft-1',
          url: draftUrl,
          canonical_url: draftUrl,
          title: fallback.title,
          outlet: fallback.outlet,
          published_date: fallback.date,
          lang: fallback.lang,
          kind: fallback.kind,
          topic: fallback.topic,
          status: 'draft',
          ai_metadata: {},
        },
      ]);

    const records = await getMediaRecords();

    expect(records.some((record) => record.title === fallback.title)).toBe(false);
    expect(records.some((record) => record.url === fallback.url)).toBe(false);
    expect(records).toHaveLength(localRecords.length - 1);
  });

  it('returns a published database row with public fields only', async () => {
    state.__mediaTestClient = clientWithMedia([
        {
          id: 'pub-1',
          url: 'https://example.com/media/published-record',
          canonical_url: 'https://example.com/media/published-record',
          title: 'A verified international interview',
          outlet: 'Example Times',
          author: 'Jane Reporter',
          published_date: '2026-10-13',
          lang: 'EN',
          kind: 'interview',
          topic: 'AI & Tech',
          summary: 'Public summary.',
          status: 'published',
          ai_metadata: { slug: 'published-record', owner_note: 'do not expose' },
          access_class: 'owner',
          media_coverage_diagnostics: { private: true },
        },
      ]);

    const records = await getMediaRecords();
    const record = records.find((item) => item.id === 'pub-1');

    expect(record).toMatchObject({
      slug: 'published-record',
      title: 'A verified international interview',
      author: 'Jane Reporter',
      outlet: 'Example Times',
      date: '2026-10-13',
      lang: 'EN',
      kind: 'interview',
    });
    expect(record).not.toHaveProperty('status');
    expect(record).not.toHaveProperty('ai_metadata');
    expect(record).not.toHaveProperty('access_class');
    expect(record).not.toHaveProperty('media_coverage_diagnostics');
    expect(JSON.stringify(record)).not.toContain('do not expose');
  });

  it('never exposes non-published rows even when they have a unique URL', async () => {
    state.__mediaTestClient = clientWithMedia([
        {
          id: 'archived-1',
          url: 'https://example.com/media/archived-record',
          canonical_url: 'https://example.com/media/archived-record',
          title: 'Archived record',
          outlet: 'Example Times',
          published_date: '2026-10-13',
          lang: 'EN',
          kind: 'mention',
          topic: 'AI & Tech',
          status: 'archived',
          ai_metadata: {},
        },
      ]);

    const records = await getMediaRecords();

    expect(records.some((record) => record.id === 'archived-1')).toBe(false);
    expect(records).toHaveLength(localRecords.length);
  });

  it('maps Albanian SQ and Armenian HY records without relabelling them', async () => {
    state.__mediaTestClient = clientWithMedia([
      {
        id: 'sq-1',
        url: 'https://example.com/media/gazeta-shqip',
        canonical_url: 'https://example.com/media/gazeta-shqip',
        title: 'Gazeta Shqip publication',
        outlet: 'Gazeta Shqip',
        published_date: '2026-05-28',
        lang: 'SQ',
        kind: 'mention',
        topic: 'Internet & Censorship',
        status: 'published',
        ai_metadata: {},
      },
      {
        id: 'hy-1',
        url: 'https://example.com/media/armenian-record',
        canonical_url: 'https://example.com/media/armenian-record',
        title: 'Armenian publication',
        outlet: 'Armenian outlet',
        published_date: '2026-05-27',
        lang: 'HY',
        kind: 'mention',
        topic: 'Internet & Censorship',
        status: 'published',
        ai_metadata: {},
      },
    ]);

    const records = await getMediaRecords();

    expect(records.find((item) => item.id === 'sq-1')?.lang).toBe('SQ');
    expect(records.find((item) => item.id === 'hy-1')?.lang).toBe('HY');
  });

  it('preserves an unknown database language instead of masking it as EN', async () => {
    state.__mediaTestClient = clientWithMedia([
      {
        id: 'unknown-lang-1',
        url: 'https://example.com/media/unknown-language',
        canonical_url: 'https://example.com/media/unknown-language',
        title: 'Publication with an unlisted language',
        outlet: 'Example Times',
        published_date: '2026-05-26',
        lang: 'az',
        kind: 'mention',
        topic: 'Internet & Censorship',
        status: 'published',
        ai_metadata: {},
      },
      {
        id: 'missing-lang-1',
        url: 'https://example.com/media/missing-language',
        canonical_url: 'https://example.com/media/missing-language',
        title: 'Publication with no stored language',
        outlet: 'Example Times',
        published_date: '2026-05-25',
        lang: null,
        kind: 'mention',
        topic: 'Internet & Censorship',
        status: 'published',
        ai_metadata: {},
      },
    ]);

    const records = await getMediaRecords();
    const unknown = records.find((item) => item.id === 'unknown-lang-1');
    const missing = records.find((item) => item.id === 'missing-lang-1');

    expect(unknown?.lang).toBe('AZ');
    expect(unknown?.lang).not.toBe('EN');
    expect(missing?.lang).toBe('Unknown');
    expect(missing?.lang).not.toBe('EN');
  });

  it('does not display an invalid calendar date as if it were verified', async () => {
    state.__mediaTestClient = clientWithMedia([
        {
          id: 'bad-date-1',
          url: 'https://example.com/media/bad-date',
          canonical_url: 'https://example.com/media/bad-date',
          title: 'Bad date record',
          outlet: 'Example Times',
          published_date: '2026-02-30',
          created_at: '2026-11-01T00:00:00.000Z',
          lang: 'EN',
          kind: 'mention',
          topic: 'AI & Tech',
          status: 'published',
          ai_metadata: {},
        },
      ]);

    const record = (await getMediaRecords()).find((item) => item.id === 'bad-date-1');

    expect(record?.date).toBe('2026-11-01');
    expect(record?.note).toContain('Publication date unavailable');
  });
});
