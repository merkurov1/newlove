import type { JournalLanguage } from '@/lib/i18n/journal';

type JournalIssueLike = {
  id: string;
  lang: JournalLanguage;
};

/**
 * Split the journal catalogue into a featured issue and the remaining archive.
 *
 * Interface language only decides which edition is featured when one exists.
 * It never filters the archive: a Russian edition remains visible on the
 * English journal and vice versa, and each entry keeps its own `lang`.
 */
export function selectJournalIssues<T extends JournalIssueLike>(
  issues: T[],
  uiLang: JournalLanguage
): { featured: T | null; archive: T[] } {
  const featured = issues.find((issue) => issue.lang === uiLang) ?? issues[0] ?? null;
  const archive = issues.filter((issue) => issue.id !== featured?.id);

  return { featured, archive };
}
