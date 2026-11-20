/**
 * @jest-environment node
 */

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(),
}));

import { getServerSupabaseClient } from '@/lib/serverAuth';
import { listPublicFlowIssues } from '../public';

type Row = Record<string, unknown>;

function fakeClient(rows: Row[]) {
  const calls: { where: string }[] = [];

  const makeQuery = () => {
    let from = 0;
    let to = rows.length;

    const chain: any = {
      select: () => chain,
      eq: (key: string) => {
        calls.push({ where: key });

        if (key === 'lang') {
          throw new Error('flow issue archive must not filter by language');
        }

        return chain;
      },
      order: () => chain,
      range: (start: number, end: number) => {
        from = start;
        to = end;
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
      },
    };

    return chain;
  };

  return {
    calls,
    client: {
      from: () => makeQuery(),
    },
  };
}

function row(index: number, lang: 'ru' | 'en'): Row {
  return {
    id: `issue-${index}`,
    slug: `issue-${index}`,
    title: `Issue ${index}`,
    kind: 'issue',
    status: 'published',
    published: true,
    lang,
    number: index,
    html_web: '<html><body></body></html>',
    payload: null,
    publishedAt: `2026-11-${String((index % 27) + 1).padStart(2, '0')}T00:00:00.000Z`,
    createdAt: '2026-11-01T00:00:00.000Z',
  };
}

describe('public Flow issue archive', () => {
  beforeEach(() => {
    (getServerSupabaseClient as jest.Mock).mockReset();
  });

  it('keeps both language editions and never filters by language', async () => {
    const fake = fakeClient([row(2, 'en'), row(1, 'ru')]);
    (getServerSupabaseClient as jest.Mock).mockReturnValue(fake.client);

    const issues = await listPublicFlowIssues('en');

    expect(issues.map((issue) => issue.slug)).toEqual(['issue-2', 'issue-1']);
    expect(issues.map((issue) => issue.lang)).toEqual(['en', 'ru']);
    expect(fake.calls.map((call) => call.where)).not.toContain('lang');
  });

  it('pages through the whole catalogue instead of stopping at the first batch', async () => {
    const rows = Array.from({ length: 201 }, (_, index) => row(index, index % 2 ? 'ru' : 'en'));
    const fake = fakeClient(rows);
    (getServerSupabaseClient as jest.Mock).mockReturnValue(fake.client);

    const issues = await listPublicFlowIssues();

    expect(issues).toHaveLength(201);
    expect(issues[0].slug).toBe('issue-0');
    expect(issues[200].slug).toBe('issue-200');
  });
});
