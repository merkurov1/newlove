import Link from 'next/link';
import type { FrontIssue } from './types';
import { JOURNAL_COPY, journalIssueHref, type JournalLanguage } from '@/lib/i18n/journal';
import { dateLong, items, period } from '@/lib/journal/format';

type Props = {
  issues: FrontIssue[];
  lang: JournalLanguage;
  /** The main page shows a compact preview; the full archive is a separate page. */
  limit?: number;
};

/**
 * Compact archive preview for the Journal front page.
 *
 * It deliberately contains both language editions. Filtering and pagination
 * live on the complete archive page, so this list never hides catalogue rows
 * behind a client-side filter.
 */
export default function JournalArchiveList({ issues, lang, limit = 6 }: Props) {
  const copy = JOURNAL_COPY[lang];
  const visible = issues.slice(0, Math.max(0, limit));

  if (visible.length === 0) {
    return <p className="py-6 font-serif italic text-neutral-400">{copy.archive.empty}</p>;
  }

  return (
    <ul>
      {visible.map((issue) => {
        const when =
          dateLong(issue.publishedAt, lang) ||
          period(issue.periodStart, issue.periodEnd, lang);

        return (
          <li key={issue.id} className="border-t border-neutral-300">
            <Link
              href={journalIssueHref(issue.lang, issue.slug)}
              className="group grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[9.5rem_1fr_auto] sm:items-baseline"
            >
              <span className="font-mono text-[10px] uppercase leading-5 tracking-[0.14em] text-neutral-500">
                <time dateTime={issue.publishedAt || undefined}>{when || '—'}</time>
                <span className="block">
                  {copy.archive.issue}
                  {issue.number ? ` №${issue.number}` : ''}
                </span>
              </span>

              <span className="min-w-0">
                <span
                  lang={issue.lang}
                  className="block break-words font-serif text-xl leading-snug text-neutral-900 transition-colors group-hover:text-[#7A2233]"
                >
                  {issue.headline}
                </span>
                {issue.published != null && (
                  <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-neutral-500">
                    {items(issue.published, lang)}
                  </span>
                )}
              </span>

              <span
                lang={issue.lang}
                className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500"
              >
                {copy.languages[issue.lang]}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
