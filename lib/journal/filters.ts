import type { JournalLanguage } from '@/lib/i18n/journal';

export type JournalArchiveLanguage = JournalLanguage | 'all';
export type JournalArchiveYear = number | 'all';

export type JournalArchiveFilter = {
  year: JournalArchiveYear;
  lang: JournalArchiveLanguage;
};

type FilterableIssue = {
  id?: string | number | null;
  lang?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  periodEnd?: string | null;
  payload?: { period?: { end?: string | null } | null } | null;
};

function parseYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCFullYear();
}

/**
 * The year shown by the archive filter. Publication date is the primary
 * signal; the period end covers old rows that were stored before publishedAt
 * was filled in.
 */
export function journalIssueYear(issue: FilterableIssue): number | null {
  return (
    parseYear(issue.publishedAt) ||
    parseYear(issue.createdAt) ||
    parseYear(issue.periodEnd) ||
    parseYear(issue.payload?.period?.end)
  );
}

export function journalArchiveYears(issues: FilterableIssue[]): number[] {
  const years = new Set<number>();

  for (const issue of issues) {
    const year = journalIssueYear(issue);
    if (year != null) years.add(year);
  }

  return [...years].sort((left, right) => right - left);
}

function normalizedLanguage(value: string | null | undefined): JournalLanguage {
  return String(value || '')
    .toLowerCase()
    .trim()
    .startsWith('en')
    ? 'en'
    : 'ru';
}

/**
 * Pure archive filter. It never mutates or deduplicates the catalogue; the
 * caller passes the complete list and receives a language/year slice of it.
 */
export function filterJournalIssues<T extends FilterableIssue>(
  issues: T[],
  filter: JournalArchiveFilter
): T[] {
  return issues.filter((issue) => {
    if (filter.lang !== 'all' && normalizedLanguage(issue.lang) !== filter.lang) {
      return false;
    }

    if (filter.year !== 'all' && journalIssueYear(issue) !== filter.year) {
      return false;
    }

    return true;
  });
}
