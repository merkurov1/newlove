'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import type { FrontIssue } from './types';
import { JOURNAL_COPY, journalIssueHref, type JournalLanguage } from '@/lib/i18n/journal';
import {
  filterJournalIssues,
  journalArchiveYears,
  type JournalArchiveLanguage,
  type JournalArchiveYear,
} from '@/lib/journal/filters';
import { dateLong, items } from '@/lib/journal/format';

type Props = {
  issues: FrontIssue[];
  lang: JournalLanguage;
};

export default function JournalArchiveList({ issues, lang }: Props) {
  const copy = JOURNAL_COPY[lang];
  const [year, setYear] = useState<JournalArchiveYear>('all');
  const [language, setLanguage] = useState<JournalArchiveLanguage>('all');
  const yearId = useId();
  const languageId = useId();

  const years = useMemo(() => journalArchiveYears(issues), [issues]);
  const visible = useMemo(
    () => filterJournalIssues(issues, { year, lang: language }),
    [issues, year, language]
  );

  if (issues.length === 0) {
    return <p className="py-6 font-serif italic text-neutral-400">{copy.archive.empty}</p>;
  }

  const filtered = year !== 'all' || language !== 'all';

  return (
    <div>
      <div
        role="group"
        aria-label={copy.archive.filters.ariaLabel}
        className="flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-neutral-300 py-3 font-mono text-[9px] uppercase tracking-[0.12em] text-neutral-500"
      >
        <span className="inline-flex flex-col gap-1">
          <label htmlFor={yearId}>{copy.archive.filters.year}</label>
          <select
            id={yearId}
            value={year === 'all' ? 'all' : String(year)}
            onChange={(event) => {
              const value = event.target.value;
              setYear(value === 'all' ? 'all' : Number(value));
            }}
            className="border border-neutral-300 bg-transparent px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-800 focus:border-neutral-900 focus:outline-none"
          >
            <option value="all">{copy.archive.filters.allYears}</option>
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </span>

        <span className="inline-flex flex-col gap-1">
          <label htmlFor={languageId}>{copy.archive.filters.language}</label>
          <select
            id={languageId}
            value={language}
            onChange={(event) => setLanguage(event.target.value as JournalArchiveLanguage)}
            className="border border-neutral-300 bg-transparent px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-800 focus:border-neutral-900 focus:outline-none"
          >
            <option value="all">{copy.archive.filters.allLanguages}</option>
            <option value="ru">{copy.languages.ru}</option>
            <option value="en">{copy.languages.en}</option>
          </select>
        </span>

        {filtered && (
          <button
            type="button"
            onClick={() => {
              setYear('all');
              setLanguage('all');
            }}
            className="ml-auto border-b border-neutral-400 pb-0.5 text-[9px] uppercase tracking-[0.12em] text-neutral-600 transition-colors hover:border-neutral-900 hover:text-neutral-900"
          >
            {copy.archive.filters.reset}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="border-t border-neutral-300 py-6 font-serif italic text-neutral-400">
          {copy.archive.filters.noMatches}
        </p>
      ) : (
        <ul aria-live="polite">
          {visible.map((issue) => (
            <li key={issue.id} className="border-t border-neutral-300">
              <Link
                href={journalIssueHref(issue.lang, issue.slug)}
                className="group grid grid-cols-[1fr_auto] items-baseline gap-4 py-4"
              >
                <span>
                  <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                    {dateLong(issue.publishedAt, lang)}
                  </span>
                  <span
                    lang={issue.lang}
                    className="mt-1 block font-serif text-xl leading-snug text-neutral-900 transition-colors group-hover:text-[#7A2233]"
                  >
                    {issue.headline}
                  </span>
                  <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-neutral-500">
                    {copy.archive.issue}
                    {issue.number ? ` №${issue.number}` : ''}
                    {issue.published != null ? ` · ${items(issue.published, lang)}` : ''}
                  </span>
                </span>
                <span
                  lang={issue.lang}
                  className="font-mono text-[10px] font-semibold uppercase tracking-wider text-neutral-500"
                >
                  {copy.languages[issue.lang]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
