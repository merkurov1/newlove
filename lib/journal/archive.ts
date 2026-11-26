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
 *
 * The editorial front page uses `selectJournalEdition` instead: it keeps the
 * same global issue context but picks the published edition in the reader's
 * language when one exists. This function remains the language-independent
 * catalogue primitive and is still used by the archive and older callers.
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

/**
 * Pick the current issue for one interface language without losing the global
 * issue context.
 *
 * The newest published issue globally defines the issue being presented. If
 * that issue has a published edition in the reader's language (matched by the
 * exact issue period), the front page shows that edition's real materials.
 * When no such edition exists the original edition is shown unchanged — the
 * page never invents or machine-translates an "approved" translation.
 */
export function selectJournalEdition<T extends JournalIssueLike>(
  issues: T[],
  uiLang: JournalLanguage
): { featured: T | null; archive: T[]; counterpart: T | null } {
  const catalogue = sortJournalIssues(uniqueJournalIssues(issues));
  const globalIssue = catalogue[0] ?? null;

  if (!globalIssue) {
    return { featured: null, archive: [], counterpart: null };
  }

  const edition =
    globalIssue.lang === uiLang
      ? globalIssue
      : findIssueCounterpart(globalIssue, catalogue, uiLang) || globalIssue;

  const counterpart = findIssueCounterpart(edition, catalogue, edition.lang === 'en' ? 'ru' : 'en');

  return {
    featured: edition,
    archive: catalogue.filter((issue) => String(issue.id) !== String(edition.id)),
    counterpart,
  };
}

function hasPeriod(issue: JournalIssueLike): boolean {
  return Boolean(issue.periodStart && issue.periodEnd);
}

function samePeriod(left: JournalIssueLike, right: JournalIssueLike): boolean {
  if (!hasPeriod(left) || !hasPeriod(right)) return false;

  return (
    timestamp(left.periodStart) === timestamp(right.periodStart) &&
    timestamp(left.periodEnd) === timestamp(right.periodEnd)
  );
}

function issueNumber(issue: JournalIssueLike): number | null {
  return typeof issue.number === 'number' && Number.isFinite(issue.number) ? issue.number : null;
}

/**
 * Find the edition of the same issue in another language.
 *
 * RU and EN editions are numbered independently (the production catalogue has
 * EN issue 17 next to RU issue 25 for the same week), so a matching number
 * alone is *not* a reliable pair. The stable identifier is the issue period:
 * both editions of one weekly issue share an exact start/end. A number can
 * only break a tie between several period matches.
 *
 * When the period is unavailable on either side we refuse to guess. A missing
 * language link is honest; a link to an unrelated issue is not.
 */
export function findIssueCounterpart<T extends JournalIssueLike>(
  issue: T | null | undefined,
  issues: T[],
  targetLang: JournalLanguage
): T | null {
  if (!issue) return null;
  if (issue.lang === targetLang) return null;

  const candidates = issues.filter(
    (candidate) => String(candidate.id) !== String(issue.id) && candidate.lang === targetLang
  );

  if (candidates.length === 0) return null;

  if (hasPeriod(issue)) {
    const byPeriod = candidates.filter((candidate) => samePeriod(issue, candidate));
    if (byPeriod.length === 0) return null;

    const number = issueNumber(issue);
    if (number != null) {
      const byNumber = byPeriod.find((candidate) => issueNumber(candidate) === number);
      if (byNumber) return byNumber;
    }

    return byPeriod[0];
  }

  return null;
}
