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

const micro = 'font-mono text-[9px] uppercase tracking-[0.14em] text-[#6F6A60]';

/**
 * Compact archive preview for the Journal front page.
 *
 * The archive is deliberately quieter than the current issue: one line of
 * catalogue metadata, one title, no imagery. It contains both language
 * editions, and filtering/pagination remain on the complete archive page.
 */
export default function JournalArchiveList({ issues, lang, limit = 6 }: Props) {
  const copy = JOURNAL_COPY[lang];
  const visible = issues.slice(0, Math.max(0, limit));

  if (visible.length === 0) {
    return <p className="py-6 font-serif italic text-[#6F6A60]">{copy.archive.empty}</p>;
  }

  return (
    <ul>
      {visible.map((issue) => {
        const when =
          dateLong(issue.publishedAt, lang) || period(issue.periodStart, issue.periodEnd, lang);

        return (
          <li key={issue.id} className="border-t border-[#D8D2C4]">
            <Link
              href={journalIssueHref(issue.lang, issue.slug)}
              className="group grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] sm:items-baseline"
            >
              <span className={`${micro} leading-5`}>
                <span className="block text-[#3C3934]">
                  {copy.archive.issue}
                  {issue.number ? ` №${issue.number}` : ''}
                </span>
                <time dateTime={issue.publishedAt || undefined}>{when || '—'}</time>
              </span>

              <span
                lang={issue.lang}
                className="block min-w-0 break-words font-serif text-[18px] leading-snug text-[#3C3934] transition-colors group-hover:text-[#7A2233]"
              >
                {issue.headline}
              </span>

              <span
                className={`${micro} flex flex-wrap items-baseline gap-x-2 gap-y-1 sm:justify-end`}
              >
                {issue.published != null && <span>{items(issue.published, lang)}</span>}
                {issue.published != null && <span aria-hidden="true">·</span>}
                <span lang={issue.lang} className="text-[#3C3934]">
                  {copy.languages[issue.lang]}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
