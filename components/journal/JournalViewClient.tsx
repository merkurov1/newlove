'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight } from 'lucide-react';

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

function articleDate(article: JournalArticle) {
  return article.publishedAt || article.sentAt || article.createdAt;
}

function formatDate(article: JournalArticle) {
  const value = articleDate(article);
  if (!value) return null;

  return new Date(value).toLocaleDateString(
    isEnglish(article) ? 'en-GB' : 'ru-RU',
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    },
  );
}

async function fetchIssues(
  language: Language,
  offset: number,
): Promise<ApiResponse> {
  const params = new URLSearchParams({
    type: 'issues',
    lang: language,
    offset: String(offset),
    limit: '10',
  });

  const response = await fetch(`/api/journal?${params.toString()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  const data = (await response.json()) as ApiResponse;

  if (!response.ok) {
    throw new Error(data.error || 'Could not load editions.');
  }

  return data;
}

function IssueRow({
  article,
  index,
}: {
  article: JournalArticle;
  index: number;
}) {
  const english = isEnglish(article);
  const date = formatDate(article);
  const dateTime = articleDate(article);

  return (
    <article className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 border-b border-[#CFC1B3] py-6 sm:grid-cols-[3.5rem_minmax(0,1fr)_9rem] sm:gap-5 sm:py-7">
      <div className="pt-1 font-mono text-xs tabular-nums text-[#8B7D72]">
        {String(index + 1).padStart(2, '0')}
      </div>

      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em]">
          <span className="font-bold text-[#990F3D]">
            {english ? 'Flow · English edition' : 'Flow · Русский выпуск'}
          </span>

          {article.number != null && (
            <span className="text-[#70675F]">No. {article.number}</span>
          )}

          <span className="text-[#70675F]">{english ? 'EN' : 'RU'}</span>
        </div>

        <h2 className="font-serif text-[1.65rem] font-bold leading-[1.08] tracking-[-0.025em] sm:text-[2rem]">
          <Link
            href={`/letters/${article.slug}`}
            className="decoration-[#0D7680] decoration-1 underline-offset-4 hover:underline"
          >
            {article.title}
          </Link>
        </h2>

        {article.preview && (
          <p className="mt-2 max-w-2xl font-serif text-[15px] leading-relaxed text-[#655A52] sm:text-base">
            {article.preview}
          </p>
        )}

        <Link
          href={`/letters/${article.slug}`}
          className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#0D7680] hover:text-[#07565D]"
        >
          {english ? 'Read edition' : 'Читать выпуск'}
          <ArrowRight size={12} />
        </Link>
      </div>

      <div className="col-start-2 mt-1 font-mono text-[10px] text-[#8B7D72] sm:col-start-3 sm:row-start-1 sm:mt-0 sm:pt-1 sm:text-right">
        {date && (
          <time dateTime={dateTime || undefined}>
            {date}
          </time>
        )}
      </div>
    </article>
  );
}

export default function JournalViewClient({
  initialArticles,
  initialHasMore,
}: Props) {
  const [language, setLanguage] = useState<Language>('all');
  const [articles, setArticles] = useState(initialArticles);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialArticles.length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function selectLanguage(nextLanguage: Language) {
    if (nextLanguage === language || loading) return;

    setLanguage(nextLanguage);
    setLoading(true);
    setError('');

    try {
      const data = await fetchIssues(nextLanguage, 0);
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
        err instanceof Error ? err.message : 'Could not load editions.',
      );
      setArticles([]);
      setHasMore(false);
      setNextOffset(0);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (loading || !hasMore) return;

    setLoading(true);
    setError('');

    try {
      const data = await fetchIssues(language, nextOffset);
      const incoming = data.articles || [];

      setArticles((current) => {
        const ids = new Set(current.map((article) => article.id));
        return [...current, ...incoming.filter((article) => !ids.has(article.id))];
      });

      setHasMore(Boolean(data.hasMore));
      setNextOffset(
        typeof data.nextOffset === 'number'
          ? data.nextOffset
          : nextOffset + incoming.length,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load more editions.',
      );
    } finally {
      setLoading(false);
    }
  }

  const filters: { value: Language; label: string }[] = [
    { value: 'all', label: 'All editions' },
    { value: 'ru', label: 'Русский' },
    { value: 'en', label: 'English' },
  ];

  return (
    <section className="pb-10 pt-7 sm:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-[3px] border-[#33302E] pb-3">
        <div>
          <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#990F3D]">
            The latest
          </p>
          <h2 className="font-serif text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
            Latest editions
          </h2>
        </div>

        <div className="flex flex-wrap gap-3 pb-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => selectLanguage(filter.value)}
              disabled={loading}
              aria-pressed={language === filter.value}
              className={`border-b-2 pb-1 transition-colors disabled:opacity-50 ${
                language === filter.value
                  ? 'border-[#990F3D] text-[#990F3D]'
                  : 'border-transparent text-[#70675F] hover:text-[#33302E]'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {articles.length === 0 && !loading ? (
        <div className="border-b border-[#CFC1B3] py-12">
          <p className="font-serif text-lg text-[#655A52]">
            {error ||
              (language === 'en'
                ? 'No English editions found.'
                : language === 'ru'
                  ? 'Русских выпусков пока нет.'
                  : 'No editions found.')}
          </p>
        </div>
      ) : (
        <div aria-busy={loading}>
          {articles.map((article, index) => (
            <IssueRow
              key={article.id}
              article={article}
              index={index}
            />
          ))}
        </div>
      )}

      {error && articles.length > 0 && (
        <p role="alert" className="pt-4 font-mono text-xs text-[#990F3D]">
          {error}
        </p>
      )}

      {loading && (
        <p className="py-5 font-mono text-[10px] uppercase tracking-wider text-[#70675F]">
          Loading editions…
        </p>
      )}

      {hasMore && !loading && (
        <div className="border-b border-[#CFC1B3] py-6">
          <button
            type="button"
            onClick={loadMore}
            className="inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#0D7680] hover:text-[#07565D]"
          >
            Load more editions
            <ArrowDown size={13} />
          </button>
        </div>
      )}

      {!hasMore && articles.length > 0 && (
        <p className="pt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B7D72]">
          End of latest editions ·{' '}
          <Link href="/letters" className="text-[#0D7680] hover:underline">
            Browse the archive
          </Link>
        </p>
      )}
    </section>
  );
}