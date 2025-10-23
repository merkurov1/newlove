"use client";

import { useEffect, useState, useRef, FC } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import EditButton from '@/components/EditButton';

// Вспомогательная функция больше не нужна, так как page.js готовит данные

interface Article {
  id: string;
  title: string;
  slug: string;
  preview_image?: string | null;
  description?: string;
  excerpt?: string | null;
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
  const [hasMore, setHasMore] = useState(initialArticles.length >= PAGE_SIZE);
  const [offset, setOffset] = useState(initialArticles.length);
  const loaderRef = useRef<HTMLDivElement>(null);
  const [infiniteDone, setInfiniteDone] = useState(false);

  // Логика подгрузки без изменений
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
    <div className="w-full">
      {/* ИЗМЕНЕНИЕ: Оптимизированная сетка для лучшего вида на планшетах */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {articles.map((article) => {
          const imageUrl = article.preview_image; // Данные уже подготовлены в page.js

          return (
            <article
              key={article.id}
              // ИЗМЕНЕНИЕ: Добавлены тени, скругления и эффекты для консистентности
              className="relative flex flex-col group overflow-hidden rounded-xl shadow-md bg-white dark:bg-neutral-900 transition-transform duration-300 ease-in-out hover:-translate-y-1"
              role="listitem"
            >
              <div className="absolute top-3 right-3 z-20">
                <EditButton contentType="article" contentId={article.id} variant="compact" />
              </div>
              
              <Link
                href={`/${article.slug}`}
                className="block relative w-full"
                aria-label={`Читать статью: ${article.title}`}
              >
                {/* Контейнер для изображения с фиксированным соотношением сторон */}
                <div className="aspect-video relative overflow-hidden">
                  {imageUrl ? (
                    <SafeImage
                      src={imageUrl}
                      alt={`Изображение к статье: ${article.title}`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      // ИЗМЕНЕНИЕ: object-cover заполняет все пространство, убирая белые поля
                      className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-neutral-800 dark:to-neutral-700 flex items-center justify-center">
                      <div className="text-4xl text-gray-300">📰</div>
                    </div>
                  )}
                </div>
              </Link>

              {/* ИЗМЕНЕНИЕ: flex-grow заставляет этот блок растягиваться, выравнивая все карточки по высоте */}
              <div className="flex flex-col flex-grow p-4">
                <Link href={`/${article.slug}`} className="flex-grow">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100 mb-2 line-clamp-2 leading-snug group-hover:text-pink-600 dark:group-hover:text-pink-400">
                    {article.title}
                  </h3>
                </Link>
                {(article.excerpt || article.description) && (
                  <p className="text-gray-600 dark:text-neutral-300 text-sm line-clamp-3 mt-auto">
                    {article.excerpt || article.description}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {/* ... (остальная часть компонента для подгрузки) ... */}
    </div>
  );
};

export default ArticlesFeed;
