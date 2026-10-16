'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Newspaper, BookOpen, Globe2 } from 'lucide-react';

export interface JournalArticle {
  id: string;
  title: string;
  slug: string;
  preview: string;
  publishedAt: string | null;
  sentAt: string | null;
  createdAt: string | null;
  kind: string;
  lang: string | null;
  number?: number | null;
}

interface Props {
  articles: JournalArticle[];
}

export default function JournalViewClient({ articles }: Props) {
  const [selectedLang, setSelectedLang] = useState<'all' | 'ru' | 'en'>('all');

  const stats = useMemo(() => {
    let ruCount = 0;
    let enCount = 0;

    for (const a of articles) {
      const l = (a.lang || '').toLowerCase().trim();
      if (l === 'en' || l.startsWith('en')) {
        enCount++;
      } else {
        ruCount++;
      }
    }

    return {
      all: articles.length,
      ru: ruCount,
      en: enCount,
    };
  }, [articles]);

  const filteredArticles = useMemo(() => {
    if (selectedLang === 'all') return articles;
    return articles.filter((a) => {
      const l = (a.lang || '').toLowerCase().trim();
      const isEn = l === 'en' || l.startsWith('en');
      return selectedLang === 'en' ? isEn : !isEn;
    });
  }, [articles, selectedLang]);

  return (
    <div className="mx-auto max-w-3xl px-6 pb-28">
      {/* Language filter navigation */}
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[#E8E2D8] pb-4">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setSelectedLang('all')}
            className={`rounded-full px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${
              selectedLang === 'all'
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'bg-[#F4EFEA] text-neutral-600 hover:bg-[#EAE4DC] hover:text-neutral-900'
            }`}
          >
            Все <span className="opacity-70">({stats.all})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedLang('ru')}
            className={`rounded-full px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${
              selectedLang === 'ru'
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'bg-[#F4EFEA] text-neutral-600 hover:bg-[#EAE4DC] hover:text-neutral-900'
            }`}
          >
            По-русски <span className="opacity-70">({stats.ru})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedLang('en')}
            className={`rounded-full px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${
              selectedLang === 'en'
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'bg-[#F4EFEA] text-neutral-600 hover:bg-[#EAE4DC] hover:text-neutral-900'
            }`}
          >
            In English <span className="opacity-70">({stats.en})</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-400">
          <Globe2 size={13} />
          <span>{selectedLang === 'en' ? 'English issues' : selectedLang === 'ru' ? 'Русские выпуски' : 'Все публикации'}</span>
        </div>
      </div>

      {/* Publications Feed */}
      {filteredArticles.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-serif text-lg text-neutral-500">
            {selectedLang === 'en'
              ? 'No English issues published yet.'
              : selectedLang === 'ru'
                ? 'Русскоязычных выпусков не найдено.'
                : 'No dispatches found.'}
          </p>
          {selectedLang !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedLang('all')}
              className="mt-4 font-mono text-xs uppercase tracking-wider text-neutral-900 underline underline-offset-4"
            >
              Показать все публикации
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {filteredArticles.map((article) => {
            const displayDate =
              article.publishedAt || article.sentAt || article.createdAt;

            const isIssue = article.kind === 'issue';
            const isEn =
              (article.lang || '').toLowerCase().trim() === 'en' ||
              (article.lang || '').toLowerCase().trim().startsWith('en');

            const href = isIssue
              ? `/letters/${article.slug}`
              : `/journal/${article.slug}`;

            const formattedDate = displayDate
              ? new Date(displayDate).toLocaleDateString(
                  isEn ? 'en-GB' : 'ru-RU',
                  {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  },
                )
              : null;

            if (isIssue) {
              return (
                <article
                  key={article.id}
                  className="group relative overflow-hidden rounded-2xl border border-[#E8E2D8] bg-white/80 p-6 sm:p-8 transition-all duration-300 hover:border-[#990F3D]/40 hover:bg-white hover:shadow-[0_12px_36px_rgba(153,15,61,0.05)]"
                >
                  <Link href={href} className="block">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#F0EAE1] pb-3.5 font-mono text-[11px] uppercase tracking-wider text-neutral-400">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-2 w-2 rounded-full bg-[#990F3D]" />
                        <span className="font-semibold text-[#990F3D]">
                          {isEn ? 'Flow Newspaper' : 'Газета Flow'}
                          {article.number ? ` · № ${article.number}` : ''}
                        </span>
                        <span className="rounded bg-[#F4EFEA] px-1.5 py-0.5 text-[9px] font-semibold text-neutral-600">
                          {isEn ? 'EN' : 'RU'}
                        </span>
                      </div>

                      {formattedDate && (
                        <time
                          dateTime={displayDate || undefined}
                          className="text-neutral-400"
                        >
                          {formattedDate}
                        </time>
                      )}
                    </div>

                    <h2 className="mb-3 font-serif text-2xl font-normal leading-tight text-neutral-900 transition-colors duration-200 group-hover:text-[#990F3D] sm:text-3xl">
                      {article.title}
                    </h2>

                    {article.preview && (
                      <p className="mb-5 line-clamp-3 font-serif text-[15px] sm:text-base leading-relaxed text-neutral-600">
                        {article.preview}
                      </p>
                    )}

                    <div className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-[#990F3D] transition-transform duration-200 group-hover:translate-x-1">
                      <span>{isEn ? 'Read issue' : 'Читать выпуск'}</span>
                      <ArrowRight size={13} />
                    </div>
                  </Link>
                </article>
              );
            }

            return (
              <article
                key={article.id}
                className="group border-b border-[#E8E2D8]/80 pb-8 last:border-b-0"
              >
                <Link href={href} className="block">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500">Dispatch</span>
                      {article.lang && (
                        <span className="rounded bg-[#F4EFEA] px-1.5 py-0.5 text-[9px] font-semibold text-neutral-600">
                          {isEn ? 'EN' : 'RU'}
                        </span>
                      )}
                    </div>
                    {formattedDate && (
                      <time dateTime={displayDate || undefined}>
                        {formattedDate}
                      </time>
                    )}
                  </div>

                  <h2 className="mb-3 font-serif text-2xl font-normal leading-tight text-neutral-900 transition-colors duration-200 group-hover:text-[#990F3D] sm:text-3xl">
                    {article.title}
                  </h2>

                  {article.preview && (
                    <p className="mb-4 line-clamp-3 font-serif text-[15px] sm:text-base leading-relaxed text-neutral-700">
                      {article.preview}
                    </p>
                  )}

                  <div className="inline-flex items-center gap-2 border-b border-neutral-900 pb-1 text-xs font-bold uppercase tracking-widest transition-all group-hover:border-[#990F3D] group-hover:text-[#990F3D]">
                    <span>Read Dispatch</span>
                    <ArrowRight size={12} />
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
