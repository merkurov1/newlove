"use client";

import { useEffect, useState, useRef, FC } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import EditButton from '@/components/EditButton';

// Вспомогательная функция для исправления URL с явным указанием типа
const normalizeImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  return url.replace(/([^:]\/)\/+/g, "$1");
};

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  publishedAt: string;
  previewImage?: string | null;
  preview_image?: string | null;
  description?: string;
  author?: {
    name?: string;
    image?: string;
  };
  tags?: any[];
}

interface ArticlesFeedProps {
  initialArticles: Article[];
  excludeTag?: string | null;
  includeTag?: string | null;
}

const PAGE_SIZE = 15;
const API_PAGE_SIZE = 15;

const ArticlesFeed: FC<ArticlesFeedProps> = ({ initialArticles, excludeTag, includeTag }) => {
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialArticles.length === PAGE_SIZE);
  const [offset, setOffset] = useState(initialArticles.length);
  const loaderRef = useRef<HTMLDivElement>(null);
  const [infiniteDone, setInfiniteDone] = useState(false);

  useEffect(() => {
    if (infiniteDone || !hasMore) return;
    const handleScroll = () => {
      if (!loaderRef.current) return;
      const rect = loaderRef.current.getBoundingClientRect();
      if (rect.top < window.innerHeight && !loading) {
        setLoading(true);
        const query = new URLSearchParams({ offset: String(offset), limit: String(API_PAGE_SIZE) });
        if (excludeTag) query.set('excludeTag', excludeTag);
        if (includeTag) query.set('includeTag', includeTag);
        fetch(`/api/articles?${query.toString()}`)
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
  }, [offset, loading, infiniteDone, hasMore, excludeTag, includeTag]);

  return (
    <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 md:px-10">
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 overflow-x-hidden">
        {articles.map((article) => {
          const imageUrl = normalizeImageUrl(article.previewImage || article.preview_image);
          return (
            <article
              key={article.id}
              className="relative flex flex-col group animate-fade-in-up min-w-0 max-w-full"
              role="listitem"
            >
              <div className="absolute top-2 right-2 z-20">
                <EditButton contentType="article" contentId={article.id} variant="compact" />
              </div>
              <Link
                href={`/${article.slug}`}
                className="block relative w-full aspect-[2/1] group min-w-0 overflow-hidden"
                aria-label={`Читать статью: ${article.title}`}
                style={{ background: '#fff', minHeight: 320 }}
              >
                {imageUrl ? (
                  <SafeImage
                    src={imageUrl}
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
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default ArticlesFeed;
