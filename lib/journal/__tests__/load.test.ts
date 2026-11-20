import { loadAllJournalIssues, type JournalIssueRow } from '../load';

type FakeResult = { data: JournalIssueRow[]; error: null };

function fakeSupabase(rows: JournalIssueRow[]) {
  const requestedFilters: string[] = [];

  const makeQuery = () => {
    let offset = 0;
    let limit = rows.length;

    const chain: any = {
      select: () => chain,
      eq: (key: string) => {
        requestedFilters.push(key);
        // The archive must never be narrowed to the interface language.
        if (key === 'lang') {
          throw new Error('archive query must not filter by lang');
        }
        return chain;
      },
      order: () => chain,
      range: (from: number, to: number): Promise<FakeResult> => {
        offset = from;
        limit = to - from + 1;
        return Promise.resolve({ data: rows.slice(offset, offset + limit), error: null });
      },
    };

    return chain;
  };

  return {
    filters: requestedFilters,
    supabase: {
      from: () => makeQuery(),
    },
  };
}

function issue(id: string, lang: 'ru' | 'en'): JournalIssueRow {
  return {
    id,
    slug: id,
    lang,
    title: `Issue ${id}`,
    publishedAt: `2026-11-${String(10 + Number(id.replace(/\D/g, ''))).padStart(2, '0')}T00:00:00.000Z`,
  };
}

describe('journal issue catalogue loader', () => {
  it('reads every page instead of stopping at the first batch', async () => {
    const rows = [issue('5', 'en'), issue('4', 'ru'), issue('3', 'en'), issue('2', 'ru')];
    const fake = fakeSupabase(rows);

    const loaded = await loadAllJournalIssues(fake.supabase, { pageSize: 2 });

    expect(loaded.map((row) => row.id)).toEqual(['5', '4', '3', '2']);
  });

  it('keeps Russian editions in the English archive query', async () => {
    const fake = fakeSupabase([issue('1', 'ru'), issue('2', 'en')]);

    const loaded = await loadAllJournalIssues(fake.supabase);

    expect(loaded.map((row) => row.lang)).toEqual(['ru', 'en']);
    expect(fake.filters).not.toContain('lang');
  });

  it('does not return duplicate issues when a row shifts between pages', async () => {
    const rows = [issue('3', 'en'), issue('2', 'ru'), issue('2', 'ru'), issue('1', 'en')];
    const fake = fakeSupabase(rows);

    const loaded = await loadAllJournalIssues(fake.supabase, { pageSize: 3 });

    expect(loaded.map((row) => row.id)).toEqual(['3', '2', '1']);
  });
});
