'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  Globe2,
  Newspaper,
} from 'lucide-react';

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

type Language = 'all' | 'ru' | 'en';

interface Props {
  initialArticles: JournalArticle[];
  latestIssues: JournalArticle[];
  initialHasMore: boolean;
}

interface ApiResponse {
  articles?: JournalArticle[];
  hasMore?: boolean;
  nextOffset?: number;
  error?: string;
}

function isEnglish(article: JournalArticle) {
  return /^en/i.test((article.lang || '').trim());
}

function displayDate(article: JournalArticle) {
  return article.publishedAt || article.sentAt || article.createdAt;
}

function formatDate(article: JournalArticle) {
  const date = displayDate(article);

  if (!date) return null;

  return new Date(date).toLocaleDateString(
    isEnglish(article) ? 'en-GB' : 'ru-RU',
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    },
  );
}

async function fetchArticles(
  lang: Language,
  offset: number,
): Promise<ApiResponse> {
  const params = new URLSearchParams({
    lang,
    offset: String(offset),
    limit: '10',
  });

  const response = await fetch(`/api/journal?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  const data = (await response.json()) as ApiResponse;

  if (!response.ok) {
    throw new Error(data.error || 'Не удалось загрузить публикации.');
  }

  return data;
}

function IssueCard({ article }: { article: JournalArticle }) {
  const english = isEnglish(article);
  const date = formatDate(article);
  const dateTime = displayDate(article);

  return (
    <article className="group relative flex h-full flex-col border border-[#E8E2D8] bg-white/70 p-5 transition-colors duration-200 hover:border-[#990F3D]/50 hover:bg-white sm:p-7">
      <Link
        href={`/letters/${article.slug}`}
        className="flex h-full flex-col outline-none focus-visible:ring-2 focus-visible:ring-[#990F3D] focus-visible:ring-offset-4"
        aria-label={`${english ? 'Read English issue' : 'Читать русский выпуск'}: ${article.title}`}
      >
        <div className="mb-5 flex items-start justify-between gap-3 border-b border-[#E8E2D8] pb-4">
          <div className="flex items-center gap-2">
            <Newspaper
              size={16}
              strokeWidth={1.5}
              className="shrink-0 text-[#990F3D]"
            />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-[#990F3D]">
              {english ? 'Flow Newspaper' : 'Газета Flow'}
            </span>
          </div>

          <span className="shrink-0 border border-[#E8E2D8] px-2 py-1 font-mono text-[10px] tracking-wider text-neutral-600">
            {english ? 'EN' : 'RU'}
          </span>
        </div>

        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-neutral-400">
          {english ? 'English edition' : 'Русский выпуск'}
          {article.number != null && ` · № ${article.number}`}
        </div>

        <h2 className="mb-3 font-serif text-2xl font-normal leading-tight text-neutral-900 transition-colors group-hover:text-[#990F3D] sm:text-[28px]">
          {article.title}
        </h2>

        {article.preview && (
          <p className="mb-6 line-clamp-4 font-serif text-[15px] leading-relaxed text-neutral-600">
            {article.preview}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#E8E2D8] pt-4">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#990F3D]">
            {english ? 'Read issue' : 'Читать выпуск'}
            <ArrowRight size={13} />
          </span>

          {date && (
            <time
              dateTime={dateTime || undefined}
              className="font-mono text-[10px] text-neutral-400"
            >
              {date}
            </time>
          )}
        </div>
      </Link>
    </article>
  );
}

function ArticleRow({ article }: { article: JournalArticle }) {
  const english = isEnglish(article);
  const date = formatDate(article);
  const dateTime = displayDate(article);

  return (
    <article className="group border-b border-[#E8E2D8] pb-8 last:border-b-0">
      <Link
        href={`/journal/${article.slug}`}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-[#990F3D] focus-visible:ring-offset-4"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">
          <div className="flex items-center gap-2">
            <span>Dispatch</span>
            {article.lang && (
              <span className="border border-[#E8E2D8] px-1.5 py-0.5 text-[9px] text-neutral-600">
                {english ? 'EN' : 'RU'}
              </span>
            )}
          </div>

          {date && (
            <time dateTime={dateTime || undefined}>{date}</time>
          )}
        </div>

        <h2 className="mb-3 font-serif text-2xl font-normal leading-tight text-neutral-900 transition-colors duration-200 group-hover:text-[#990F3D] sm:text-3xl">
          {article.title}
        </h2>

        {article.preview && (
          <p className="mb-4 line-clamp-3 font-serif text-[15px] leading-relaxed text-neutral-700 sm:text-base">
            {article.preview}
          </p>
        )}

        <span className="inline-flex items-center gap-2 border-b border-neutral-900 pb-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors group-hover:border-[#990F3D] group-hover:text-[#990F3D]">
          {english ? 'Read dispatch' : 'Читать публикацию'}
          <ArrowRight size={12} />
        </span>
      </Link>
    </article>
  );
}

export default function JournalViewClient({
  initialArticles,
  latestIssues,
  initialHasMore,
}: Props) {
  const [selectedLang, setSelectedLang] = useState<Language>('all');
  const [articles, setArticles] = useState(initialArticles);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialArticles.length);
  const [loadingFilter, setLoadingFilter] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  async function changeLanguage(lang: Language) {
    if (lang === selectedLang || loadingFilter) return;

    setSelectedLang(lang);
    setLoadingFilter(true);
    setError('');

    try {
      const data = await fetchArticles(lang, 0);
      const nextArticles = data.articles || [];

      setArticles(nextArticles);
      setHasMore(Boolean(data.hasMore));
      setNextOffset(
        typeof data.nextOffset === 'number'
          ? data.nextOffset
          : nextArticles.length,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Не удалось загрузить публикации.',
      );
      setArticles([]);
      setHasMore(false);
      setNextOffset(0);
    } finally {
      setLoadingFilter(false);
    }
  }

  async function loadMore() {
    if (loadingMore || loadingFilter || !hasMore) return;

    setLoadingMore(true);
    setError('');

    try {
      const data = await fetchArticles(selectedLang, nextOffset);
      const nextArticles = data.articles || [];

      setArticles((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        const uniqueNew = nextArticles.filter(
          (item) => !existingIds.has(item.id),
        );

        return [...current, ...uniqueNew];
      });

      setHasMore(Boolean(data.hasMore));
      setNextOffset(
        typeof data.nextOffset === 'number'
          ? data.nextOffset
          : nextOffset + nextArticles.length,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Не удалось загрузить следующие публикации.',
      );
    } finally {
      setLoadingMore(false);
    }
  }

  const languageButtons: {
    value: Language;
    label: string;
  }[] = [
    { value: 'all', label: 'Все публикации' },
    { value: 'ru', label: 'По-русски' },
    { value: 'en', label: 'In English' },
  ];

  return (
    <section className="mx-auto max-w-3xl px-6 pb-28">
      {latestIssues.length > 0 && (
        <section className="mb-16" aria-labelledby="latest-issues-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-[#E8E2D8] pb-4">
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#990F3D]">
                Flow · Latest editions
              </div>
              <h2
                id="latest-issues-heading"
                className="font-serif text-2xl font-normal text-neutral-900 sm:text-3xl"
              >
                Последние выпуски
              </h2>
            </div>

            <Link
              href="/letters"
              className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-neutral-600 transition-colors hover:text-[#990F3D]"
            >
              Архив выпусков
              <ArrowRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {latestIssues.map((issue) => (
              <IssueCard key={issue.id} article={issue} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="journal-archive-heading">
        <div className="mb-6 border-b border-[#E8E2D8] pb-4">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-400">
            <Globe2 size={13} />
            Journal archive
          </div>

          <h2
            id="journal-archive-heading"
            className="font-serif text-2xl font-normal text-neutral-900 sm:text-3xl"
          >
            Публикации
          </h2>
        </div>

        <div className="mb-8 flex flex-wrap gap-2" aria-label="Фильтр по языку">
          {languageButtons.map((button) => {
            const active = selectedLang === button.value;

            return (
              <button
                key={button.value}
                type="button"
                onClick={() => changeLanguage(button.value)}
                disabled={loadingFilter}
                aria-pressed={active}
                className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-wider transition-colors disabled:cursor-wait disabled:opacity-60 ${
                  active
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-[#E8E2D8] bg-transparent text-neutral-600 hover:border-neutral-400 hover:text-neutral-900'
                }`}
              >
                {button.label}
              </button>
            );
          })}
        </div>

        {loadingFilter ? (
          <p className="py-12 font-mono text-xs text-neutral-400">
            Загружаю публикации…
          </p>
        ) : articles.length === 0 ? (
          <div className="py-12">
            <p className="font-serif text-lg text-neutral-500">
              {error ||
                (selectedLang === 'en'
                  ? 'No English publications found.'
                  : selectedLang === 'ru'
                    ? 'Русскоязычных публикаций пока нет.'
                    : 'Публикаций пока нет.')}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {articles.map((article) => (
              <ArticleRow key={article.id} article={article} />
            ))}
          </div>
        )}

        {error && articles.length > 0 && (
          <p role="alert" className="mt-5 font-mono text-xs text-[#990F3D]">
            {error}
          </p>
        )}

        {hasMore && !loadingFilter && (
          <div className="mt-10 border-t border-[#E8E2D8] pt-7 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 border border-[#D8D0C5] px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-800 transition-colors hover:border-[#990F3D] hover:text-[#990F3D] disabled:cursor-wait disabled:opacity-60"
            >
              {loadingMore ? (
                'Загружаю…'
              ) : (
                <>
                  Загрузить ещё
                  <ArrowDown size={13} />
                </>
              )}
            </button>
          </div>
        )}

        {!hasMore && articles.length > 0 && !loadingFilter && (
          <p className="mt-10 border-t border-[#E8E2D8] pt-6 text-center font-mono text-[10px] uppercase tracking-wider text-neutral-400">
            Конец архива
          </p>
        )}
      </section>
    </section>
  );
}