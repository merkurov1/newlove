import type { JournalLanguage } from '@/lib/i18n/journal';

type JournalIssueLike = {
  id: string;
  lang: JournalLanguage;
  number?: number | null;
  publishedAt?: string | null;
  sentAt?: string | null;
  createdAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Publication order used by the editorial catalogue.
 *
 * The newest published issue is the single global lead, regardless of the
 * interface language. A stable id tie-breaker keeps the order deterministic for
 * issues published in the same second.
 */
export function issueRecency(issue: JournalIssueLike): number {
  return (
    timestamp(issue.publishedAt) ||
    timestamp(issue.sentAt) ||
    timestamp(issue.createdAt) ||
    timestamp(issue.periodEnd)
  );
}

export function sortJournalIssues<T extends JournalIssueLike>(issues: T[]): T[] {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((left, right) => {
      const byDate = issueRecency(right.issue) - issueRecency(left.issue);
      if (byDate !== 0) return byDate;

      const byId = String(right.issue.id).localeCompare(String(left.issue.id), 'en', {
        numeric: true,
      });
      if (byId !== 0) return byId;

      return left.index - right.index;
    })
    .map(({ issue }) => issue);
}

/**
 * Remove repeated rows while preserving the incoming order. The loader already
 * de-duplicates by id, but the journal page must also stay safe when it is
 * rendered from a cached or hand-built catalogue.
 */
export function uniqueJournalIssues<T extends JournalIssueLike>(issues: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const issue of issues) {
    const id = String(issue.id ?? '');
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    result.push(issue);
  }

  return result;
}

/**
 * Split the journal catalogue into the single global featured issue and the
 * remaining archive.
 *
 * Interface language is intentionally ignored here. `/journal` and
 * `/ru/journal` must present the same current issue; language only changes the
 * page chrome and the language of the counterpart link, if one exists.
 */
export function selectJournalIssues<T extends JournalIssueLike>(
  issues: T[],
  _uiLang?: JournalLanguage
): { featured: T | null; archive: T[] } {
  const catalogue = sortJournalIssues(uniqueJournalIssues(issues));
  const featured = catalogue[0] ?? null;
  const archive = featured
    ? catalogue.filter((issue) => String(issue.id) !== String(featured.id))
    : catalogue;

  return { featured, archive };
}

function samePeriod(
  left: JournalIssueLike,
  right: JournalIssueLike
): boolean {
  if (!left.periodStart || !left.periodEnd || !right.periodStart || !right.periodEnd) {
    return false;
  }

  return (
    timestamp(left.periodStart) === timestamp(right.periodStart) &&
    timestamp(left.periodEnd) === timestamp(right.periodEnd)
  );
}

/**
 * Find the edition of the same issue in another language.
 *
 * Published issues carry a per-language `number`; the same number identifies
 * the same edition of the journal in RU and EN. When number is unavailable we
 * only accept an exact period match, because a guessed link would take the
 * reader to an unrelated issue. If neither signal matches, the caller must not
 * render a language link at all.
 */
export function findIssueCounterpart<T extends JournalIssueLike>(
  issue: T | null | undefined,
  issues: T[],
  targetLang: JournalLanguage
): T | null {
  if (!issue) return null;
  if (issue.lang === targetLang) return null;

  const candidates = issues.filter(
    (candidate) =>
      String(candidate.id) !== String(issue.id) && candidate.lang === targetLang
  );

  if (candidates.length === 0) return null;

  const issueNumber =
    typeof issue.number === 'number' && Number.isFinite(issue.number) ? issue.number : null;

  if (issueNumber != null) {
    const byNumber = candidates.find(
      (candidate) =>
        typeof candidate.number === 'number' && candidate.number === issueNumber
    );

    if (byNumber) return byNumber;
  }

  return candidates.find((candidate) => samePeriod(issue, candidate)) ?? null;
}
