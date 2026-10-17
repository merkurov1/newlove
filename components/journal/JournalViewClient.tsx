'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDown } from 'lucide-react';

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
}

export interface JournalCursor {
  id: string;
  publishedAt: string | null;
}

interface Props {
  initialArticles: JournalArticle[];
  initialCursor: JournalCursor | null;
  initialHasMore: boolean;
}

type Language = 'all' | 'ru' | 'en';

interface JournalResponse {
  articles: JournalArticle[];
  cursor: JournalCursor | null;
  hasMore: boolean;
  error?: string;
}

const isEnglish = (language: string | null) =>
  (language || '').toLowerCase().trim().startsWith('en');

function getDisplayDate(article: JournalArticle) {
  return article.publishedAt || article.sentAt || article.createdAt || null;
}

function formatDate(date: string | null, language: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString(
    isEnglish(language) ? 'en-GB' : 'ru-RU',
    { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
  );
}

const TABS = [
  ['all', 'Все'],
  ['ru', 'По-русски'],
  ['en', 'In English'],
] as const;

export default function JournalViewClient({
  initialArticles,
  initialCursor,
  initialHasMore,
}: Props) {
  const [articles, setArticles] = useState(initialArticles);
  const [cursor, setCursor] = useState<JournalCursor | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [selectedLang, setSelectedLang] = useState<Language>('all');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function fetchPage(
    language: Language,
    nextCursor: JournalCursor | null,
  ): Promise<JournalResponse> {
    const params = new URLSearchParams();
    if (language !== 'all') params.set('lang', language);
    if (nextCursor) params.set('cursor', JSON.stringify(nextCursor));

    const response = await fetch(`/api/journal?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const result = (await response.json()) as JournalResponse;

    if (!response.ok) {
      throw new Error(result.error || 'Could not load journal entries.');
    }
    return result;
  }

  async function changeLanguage(language: Language) {
    if (loading || language === selectedLang) return;

    setSelectedLang(language);
    setLoading(true);
    setErrorMessage('');

    try {
      const result = await fetchPage(language, null);
      setArticles(result.articles);
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('[Journal] Language filter failed:', error);
      setErrorMessage('Could not load publications. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (loading || !hasMore || !cursor) return;

    setLoading(true);
    setErrorMessage('');

    try {
      const result = await fetchPage(selectedLang, cursor);
      setArticles((current) => {
        const known = new Set(current.map((a) => a.id));
        return [...current, ...result.articles.filter((a) => !known.has(a.id))];
      });
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('[Journal] Load more failed:', error);
      setErrorMessage('Could not load more publications. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      id="publications"
      className="mx-auto max-w-6xl px-5 pb-28 pt-6 sm:px-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-t-2 border-neutral-900 pb-3 pt-3">
        <h2 className="font-serif text-xl font-normal text-neutral-900">
          Публикации
        </h2>

        <div
          className="flex items-center gap-6"
          role="group"
          aria-label="Filter publications by language"
        >
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => changeLanguage(value)}
              disabled={loading}
              aria-pressed={selectedLang === value}
              className={`border-b pb-0.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:cursor-wait ${
                selectedLang === value
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {articles.length === 0 && !loading ? (
        <div className="border-t border-neutral-300 py-16 text-center">
          <p className="font-serif text-lg italic text-neutral-500">
            {selectedLang === 'en'
              ? 'No English publications found.'
              : selectedLang === 'ru'
                ? 'Русскоязычных публикаций не найдено.'
                : 'No publications found.'}
          </p>
          {selectedLang !== 'all' && (
            <button
              type="button"
              onClick={() => changeLanguage('all')}
              className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-700 underline underline-offset-4 transition-colors hover:text-[#990F3D]"
            >
              Show all publications
            </button>
          )}
        </div>
      ) : (
        <div>
          {articles.map((article) => {
            const displayDate = getDisplayDate(article);
            const formattedDate = formatDate(displayDate, article.lang);
            const en = isEnglish(article.lang);

            return (
              <article key={article.id} className="border-t border-neutral-300">
                <Link
                  href={`/journal/${article.slug}`}
                  className="group grid gap-x-10 gap-y-2 py-7 md:grid-cols-[160px_1fr]"
                >
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500 md:pt-2">
                    {formattedDate && (
                      <time dateTime={displayDate || undefined}>
                        {formattedDate}
                      </time>
                    )}
                    <span className="ml-2 text-neutral-400 md:ml-0 md:block md:pt-1">
                      {en ? 'EN' : 'RU'}
                    </span>
                  </div>

                  <div className="max-w-2xl">
                    <h3 className="font-serif text-2xl font-normal leading-tight text-neutral-900 transition-colors group-hover:text-[#990F3D] sm:text-[1.75rem]">
                      {article.title}
                    </h3>
                    {article.preview && (
                      <p className="mt-3 line-clamp-2 font-serif text-base leading-relaxed text-neutral-600">
                        {article.preview}
                      </p>
                    )}
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      )}

      {loading && (
        <p
          role="status"
          className="py-8 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-400"
        >
          Loading…
        </p>
      )}

      {errorMessage && (
        <div className="mt-8 text-center">
          <p role="alert" className="font-mono text-xs text-[#990F3D]">
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={() =>
              selectedLang === 'all' ? loadMore() : changeLanguage(selectedLang)
            }
            className="mt-3 font-mono text-xs uppercase tracking-wider underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && hasMore && articles.length > 0 && (
        <div className="mt-10 flex justify-center border-t border-neutral-300 pt-10">
          <button
            type="button"
            onClick={loadMore}
            className="inline-flex items-center gap-2 border border-neutral-900 px-6 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-[#FDFBF7]"
          >
            Load 10 more
            <ArrowDown size={13} />
          </button>
        </div>
      )}

      {!loading && !hasMore && articles.length > 0 && (
        <p className="mt-12 border-t border-neutral-300 pt-8 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          — End of journal —
        </p>
      )}
    </section>
  );
}
