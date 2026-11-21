'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import type { IssueLang } from '@/lib/flow-issue/types';
import {
  filterJournalIssues,
  journalArchiveYears,
  type JournalArchiveLanguage,
  type JournalArchiveYear,
} from '@/lib/journal/filters';

export type FlowArchiveItem = {
  id: string;
  href: string;
  lang: IssueLang;
  title: string;
  description: string;
  itemCount: number;
  dateLabel: string;
  numberLabel: string;
  publishedAt: string | null;
  createdAt: string | null;
  periodEnd: string | null;
};

type Props = {
  items: FlowArchiveItem[];
  lang: IssueLang;
};

function languageLabel(lang: IssueLang, uiLang: IssueLang): string {
  if (lang === 'ru') return uiLang === 'ru' ? 'Русский' : 'Russian';
  return uiLang === 'ru' ? 'Английский' : 'English';
}

export default function FlowIssuesArchiveFilters({ items, lang }: Props) {
  const ru = lang === 'ru';
  const [year, setYear] = useState<JournalArchiveYear>('all');
  const [language, setLanguage] = useState<JournalArchiveLanguage>('all');
  const yearId = useId();
  const languageId = useId();

  const years = useMemo(() => journalArchiveYears(items), [items]);
  const visible = useMemo(
    () => filterJournalIssues(items, { year, lang: language }),
    [items, year, language]
  );
  const filtered = year !== 'all' || language !== 'all';

  if (items.length === 0) {
    return (
      <p className="py-16 text-center font-serif italic text-[#8A8380]">
        {ru ? 'Выпусков пока нет.' : 'No issues yet.'}
      </p>
    );
  }

  return (
    <div>
      <div
        role="group"
        aria-label={ru ? 'Фильтр архива выпусков' : 'Filter the issue archive'}
        className="mb-8 flex flex-wrap items-end gap-x-5 gap-y-3 border-y border-[#DAD3CC] py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6B6568]"
      >
        <span className="inline-flex flex-col gap-1">
          <label htmlFor={yearId}>{ru ? 'Год' : 'Year'}</label>
          <select
            id={yearId}
            value={year === 'all' ? 'all' : String(year)}
            onChange={(event) => {
              const value = event.target.value;
              setYear(value === 'all' ? 'all' : Number(value));
            }}
            className="border border-[#DAD3CC] bg-transparent px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[#1C1A1B] focus:border-[#7A2233] focus:outline-none"
          >
            <option value="all">{ru ? 'Все годы' : 'All years'}</option>
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </span>

        <span className="inline-flex flex-col gap-1">
          <label htmlFor={languageId}>{ru ? 'Язык' : 'Language'}</label>
          <select
            id={languageId}
            value={language}
            onChange={(event) => setLanguage(event.target.value as JournalArchiveLanguage)}
            className="border border-[#DAD3CC] bg-transparent px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[#1C1A1B] focus:border-[#7A2233] focus:outline-none"
          >
            <option value="all">{ru ? 'Все языки' : 'All languages'}</option>
            <option value="ru">{ru ? 'Русский' : 'Russian'}</option>
            <option value="en">{ru ? 'Английский' : 'English'}</option>
          </select>
        </span>

        {filtered && (
          <button
            type="button"
            onClick={() => {
              setYear('all');
              setLanguage('all');
            }}
            className="ml-auto border-b border-[#B9AEA8] pb-0.5 text-[10px] uppercase tracking-[0.16em] text-[#6B6568] transition hover:border-[#1C1A1B] hover:text-[#1C1A1B]"
          >
            {ru ? 'Сбросить фильтры' : 'Reset filters'}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center font-serif italic text-[#8A8380]">
          {ru ? 'По этим фильтрам выпусков нет.' : 'No issues match these filters.'}
        </p>
      ) : (
        <ol aria-live="polite" className="divide-y divide-[#DAD3CC] border-b border-[#DAD3CC]">
          {visible.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group grid gap-3 py-7 transition sm:grid-cols-[9.5rem_1fr] sm:gap-6"
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] leading-5 text-[#6B6568]">
                  <time dateTime={item.publishedAt || undefined}>{item.dateLabel}</time>
                  <span className="block">{item.numberLabel}</span>
                  <span className="block text-[#8A8380]">{languageLabel(item.lang, lang)}</span>
                </div>

                <div className="min-w-0">
                  <h2
                    lang={item.lang}
                    className="font-serif text-2xl font-normal leading-snug tracking-tight text-[#1C1A1B] group-hover:underline group-hover:decoration-[#B9AEA8] group-hover:underline-offset-4"
                  >
                    {item.title}
                  </h2>

                  <p
                    lang={item.lang}
                    className="mt-2 line-clamp-2 font-serif text-[17px] leading-relaxed text-[#5B5658]"
                  >
                    {item.description}
                  </p>

                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8A8380]">
                    {item.itemCount} {ru ? 'материалов' : 'materials'}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
