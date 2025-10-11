"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  publishedAt: string;
  previewImage?: string | null;
  description?: string;
  author?: {
    name?: string;
    image?: string;
  };
  tags?: any[];
}

const PAGE_SIZE = 15;
const API_PAGE_SIZE = 15;

export default function ArticlesFeed({ initialArticles }: { initialArticles: Article[] }) {
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialArticles.length === PAGE_SIZE);
  const [offset, setOffset] = useState(initialArticles.length);
  const loaderRef = useRef<HTMLDivElement>(null);
  const [infiniteDone, setInfiniteDone] = useState(false);

  // Инфинити-скролл только до 15-й статьи
  useEffect(() => {
    if (infiniteDone || !hasMore) return;
    const handleScroll = () => {
      if (!loaderRef.current) return;
      const rect = loaderRef.current.getBoundingClientRect();
      if (rect.top < window.innerHeight && !loading) {
        setLoading(true);
        fetch(`/api/articles?offset=${offset}&limit=${API_PAGE_SIZE}`)
          .then((res) => res.json())
          .then((data) => {
            setArticles((prev) => [...prev, ...data]);
            setOffset((prev) => prev + data.length);
            setLoading(false);
            if (data.length < API_PAGE_SIZE) setHasMore(false);
            if (data.length === 0) setInfiniteDone(true);
          });
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [offset, loading, infiniteDone, hasMore]);

  // Кнопка "Показать ещё" после 15 статей
  const handleShowMore = async () => {
    setLoading(true);
    const res = await fetch(`/api/articles?offset=${articles.length}&limit=${API_PAGE_SIZE}`);
    const data = await res.json();
    setArticles((prev) => [...prev, ...data]);
    setOffset((prev) => prev + data.length);
    setLoading(false);
    if (data.length < API_PAGE_SIZE) setHasMore(false);
    // Плавный скролл к следующей порции
    setTimeout(() => {
      const last = document.querySelector('[data-last-article]');
      if (last) last.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 md:px-10 overflow-x-hidden">
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {articles.map((article, idx) => (
          <article
            key={article.id}
            data-last-article={idx === articles.length - 1 ? true : undefined}
            className="flex flex-col group animate-fade-in-up min-w-0 max-w-full"
            style={{ animationDelay: `${idx * 100}ms`, animationFillMode: "both" }}
            role="listitem"
          >
            <Link
              href={`/${article.slug}`}
              className="block relative w-full aspect-[2/1] group min-w-0 overflow-hidden"
              aria-label={`Читать статью: ${article.title}`}
              style={{background:'#fff', minHeight:320}}
            >
              {article.previewImage ? (
                <SafeImage
                  src={article.previewImage}
                  alt={`Изображение к статье: ${article.title}`}
                  fill
                  sizes="100vw"
                  className="object-contain w-full h-full max-h-[520px] transition-transform duration-200 group-hover:scale-105"
                  style={{ minHeight: 0, minWidth: 0 }}
                />
              ) : (
                <div className="w-full h-full aspect-[2/1] bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center min-h-[320px]">
                  <div className="text-center">
                    <div className="text-4xl text-gray-300 mb-2">📰</div>
                    <div className="text-sm text-gray-400">No image</div>
                  </div>
                </div>
              )}
            </Link>
            <div className="flex flex-col flex-1 px-0 pt-2 pb-4">
              <Link href={`/${article.slug}`}>
                <h3 className="text-xl font-semibold text-gray-900 mb-1 line-clamp-2 break-words leading-snug max-w-full group-hover:text-pink-500 group-hover:underline">
                  {article.title}
                </h3>
              </Link>
              {article.description && (
                <p className="text-gray-700 text-base line-clamp-2 mt-1 break-words max-w-full">{article.description}</p>
              )}
              {article.publishedAt && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-400">
                    {(() => {
                      const diff = Math.floor((Date.now() - new Date(article.publishedAt).getTime()) / 1000);
                      if (diff < 60) return `${diff} sec ago`;
                      if (diff < 3600) return `${Math.floor(diff/60)} min ago`;
                      if (diff < 86400) return `${Math.floor(diff/3600)} hours ago`;
                      return new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    })()}
                  </span>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {/* Loader для инфинити-скролла */}
      {!infiniteDone && hasMore && <div ref={loaderRef} className="h-8" />}
      {/* Кнопка "Показать ещё" */}
      {infiniteDone && hasMore && (
        <div className="flex justify-center mt-6">
          <button
            className="rounded-full bg-white/90 backdrop-blur-sm border border-pink-200 text-pink-500 px-8 py-3 text-sm font-medium hover:bg-pink-50 hover:border-pink-300 transition-all duration-300"
            onClick={handleShowMore}
            disabled={loading}
            aria-label="Показать ещё статьи"
          >
            {loading ? "Загрузка..." : "Показать ещё"}
          </button>
        </div>
      )}
      {!hasMore && articles.length > 0 && (
        <div className="text-center text-gray-400 mt-8 mb-4 text-base">Больше статей нет</div>
      )}
      {!hasMore && articles.length === 0 && (
        <div className="text-center text-gray-400 mt-8 mb-4 text-base">Здесь пока нет опубликованных статей. Самое время написать первую!</div>
      )}
    </div>
  );
}
