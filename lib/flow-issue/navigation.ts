import type { IssueLang } from './types';

export type FlowIssueNeighbor = {
  id: string;
  slug: string;
  lang: IssueLang;
  number: number | null;
  publishedAt: string | null;
  createdAt: string | null;
  payload?: { period?: { end?: string | null } | null } | null;
};

function issueTime(issue: FlowIssueNeighbor): number {
  const value = issue.publishedAt || issue.createdAt || issue.payload?.period?.end;
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function compareIssuesNewestFirst(left: FlowIssueNeighbor, right: FlowIssueNeighbor): number {
  const byDate = issueTime(right) - issueTime(left);
  if (byDate !== 0) return byDate;

  const byNumber = (right.number ?? 0) - (left.number ?? 0);
  if (byNumber !== 0) return byNumber;

  return String(right.id).localeCompare(String(left.id), 'en', { numeric: true });
}

/**
 * Adjacent issues inside the same language edition.
 *
 * "Next" walks toward the newest issue, "previous" toward the oldest. Keeping
 * the sequence per language avoids sending a reader from a Russian issue into
 * an unrelated English edition.
 */
export function findAdjacentFlowIssues<T extends FlowIssueNeighbor>(
  issues: T[],
  current: T
): { previous: T | null; next: T | null } {
  const seen = new Set<string>();
  const sameLanguage = issues
    .filter((issue) => {
      if (issue.lang !== current.lang) return false;
      const id = String(issue.id);
      if (id && seen.has(id)) return false;
      if (id) seen.add(id);
      return true;
    })
    .sort(compareIssuesNewestFirst);

  const index = sameLanguage.findIndex(
    (issue) =>
      String(issue.id) === String(current.id) || (!!issue.slug && issue.slug === current.slug)
  );

  if (index >= 0) {
    return {
      previous: sameLanguage[index + 1] ?? null,
      next: sameLanguage[index - 1] ?? null,
    };
  }

  const currentTime = issueTime(current);

  return {
    previous: sameLanguage.find((issue) => issueTime(issue) < currentTime) ?? null,
    next: sameLanguage.find((issue) => issueTime(issue) > currentTime) ?? null,
  };
}
