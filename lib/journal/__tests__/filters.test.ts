import { filterJournalIssues, journalArchiveYears, journalIssueYear } from '../filters';

const issues = [
  { id: 'ru-2026', lang: 'ru', publishedAt: '2026-11-21T10:00:00.000Z' },
  { id: 'en-2026', lang: 'en', publishedAt: '2026-11-20T10:00:00.000Z' },
  { id: 'ru-2025', lang: 'ru', publishedAt: '2025-10-10T10:00:00.000Z' },
  {
    id: 'en-legacy',
    lang: 'en',
    publishedAt: null,
    createdAt: null,
    periodEnd: '2024-09-10T00:00:00.000Z',
  },
];

describe('journal archive filters', () => {
  it('collects every year once, newest first', () => {
    expect(journalArchiveYears(issues)).toEqual([2026, 2025, 2024]);
  });

  it('reads the year from the period when publication metadata is missing', () => {
    expect(journalIssueYear(issues[3])).toBe(2024);
  });

  it('keeps the complete catalogue when no filter is selected', () => {
    expect(filterJournalIssues(issues, { year: 'all', lang: 'all' })).toHaveLength(4);
  });

  it('filters by year and language without dropping the other language', () => {
    expect(
      filterJournalIssues(issues, { year: 2026, lang: 'all' }).map((issue) => issue.id)
    ).toEqual(['ru-2026', 'en-2026']);

    expect(
      filterJournalIssues(issues, { year: 'all', lang: 'ru' }).map((issue) => issue.id)
    ).toEqual(['ru-2026', 'ru-2025']);

    expect(
      filterJournalIssues(issues, { year: 2024, lang: 'en' }).map((issue) => issue.id)
    ).toEqual(['en-legacy']);
  });

  it('returns an empty slice without mutating the source catalogue', () => {
    expect(filterJournalIssues(issues, { year: 1999, lang: 'all' })).toEqual([]);
    expect(issues).toHaveLength(4);
  });
});
