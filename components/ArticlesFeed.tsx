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

const ArticlesFeed: FC<any> = ({ initialArticles, excludeTag, includeTag }: any) => {
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialArticles.length >= API_PAGE_SIZE);
  const [offset, setOffset] = useState(initialArticles.length);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const [infiniteDone, setInfiniteDone] = useState(false);
  // refs to avoid stale closures inside observer callback
  const offsetRef = useRef(offset);
  const loadingRef = useRef(loading);
  const hasMoreRef = useRef(hasMore);

  // Логика подгрузки без изменений
  // Reset feed when include/exclude tag or initialArticles change
  useEffect(() => {
    setArticles(initialArticles);
    setOffset(initialArticles.length);
    setHasMore(initialArticles.length >= API_PAGE_SIZE);
    setInfiniteDone(false);
    offsetRef.current = initialArticles.length;
    loadingRef.current = false;
    hasMoreRef.current = initialArticles.length >= API_PAGE_SIZE;
    // debug: indicate feed reset (helpful in dev to see tag changes)
    if (process.env.NODE_ENV !== 'production') {
       
      console.debug('[ArticlesFeed] reset', { includeTag, excludeTag, initialCount: initialArticles.length });
    }
  }, [includeTag, excludeTag, initialArticles]);

  // IntersectionObserver based infinite loading (more reliable than scroll handlers)
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    if (infiniteDone) return;
    const node = loaderRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !loadingRef.current && hasMoreRef.current) {
          if (process.env.NODE_ENV !== 'production') {
             
            console.debug('[ArticlesFeed] loading more', { offset: offsetRef.current, includeTag, excludeTag });
          }
          // start loading
          setLoading(true);
          const q = new URLSearchParams({ offset: String(offsetRef.current), limit: String(API_PAGE_SIZE) });
          if (excludeTag) q.set('excludeTag', excludeTag);
          if (includeTag) q.set('includeTag', includeTag);
          fetch(`/api/selection?${q.toString()}`, { cache: 'no-store' })
            .then((res) => res.json())
            .then((data) => {
              if (!Array.isArray(data) || data.length === 0) {
                setInfiniteDone(true);
                setHasMore(false);
                return;
              }
              setArticles((prev) => {
                const existing = new Set(prev.map((p) => String(p.id)));
                const deduped = data.filter((d: any) => !existing.has(String(d.id)));
                const merged = [...prev, ...deduped];
                setOffset(merged.length);
                return merged;
              });
              if (data.length < API_PAGE_SIZE) setHasMore(false);
            })
            .catch(() => {
              // swallow fetch errors for now
            })
            .finally(() => setLoading(false));
        }
      });
    }, { rootMargin: '300px' });

    observer.observe(node);
    return () => observer.disconnect();
     
  }, [excludeTag, includeTag, infiniteDone]);

  // Periodically revalidate the initial articles (so homepage updates when new articles arrive)
  const fetchInitial = useRef<(() => Promise<void>) | undefined>(undefined);
  fetchInitial.current = async () => {
    try {
      const q = new URLSearchParams({ offset: '0', limit: String(API_PAGE_SIZE) });
      if (excludeTag) q.set('excludeTag', excludeTag);
      if (includeTag) q.set('includeTag', includeTag);
      const res = await fetch(`/api/selection?${q.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        // Put newest items first, keep previous items that are not in the fresh page
        setArticles((prev) => {
          const incomingIds = new Set(data.map((a: Article) => String(a.id)));
          const remaining = prev.filter((p) => !incomingIds.has(String(p.id)));
          const merged = [...data, ...remaining];
          setOffset(merged.length);
          setHasMore(data.length >= API_PAGE_SIZE);
          return merged;
        });
      }
    } catch (e) {
      // swallow errors — keep current list
      if (process.env.NODE_ENV !== 'production') {
         
        console.debug('[ArticlesFeed] revalidate failed', e);
      }
    }
  };

  useEffect(() => {
    // initial revalidate shortly after mount
    fetchInitial.current?.();
    const interval = setInterval(() => fetchInitial.current?.(), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchInitial.current?.();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
     
  }, [includeTag, excludeTag]);

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
      {/* sentinel for intersection observer to trigger loading more */}
      <div ref={loaderRef} aria-hidden className="w-full h-8 mt-6 flex items-center justify-center">
        {loading && <div className="text-gray-500 text-sm">Загрузка...</div>}
      </div>
    </div>
  );
};

export default ArticlesFeed;
