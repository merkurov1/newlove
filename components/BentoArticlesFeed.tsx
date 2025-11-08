// @ts-nocheck
"use client";

import { useEffect, useState, useRef, FC } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import EditButton from '@/components/EditButton';

interface Article {
  id: string;
  title: string;
  slug: string;
  preview_image?: string | null;
  description?: string;
  excerpt?: string | null;
}

interface BentoArticlesFeedProps {
  initialArticles: Article[];
  excludeTag?: string | null;
  includeTag?: string | null;
}

const PAGE_SIZE = 15;
const API_PAGE_SIZE = 15;

// Функция для определения размера карточки в Bento Grid
const getGridClasses = (index: number) => {
  const patterns = [
    'col-span-2 row-span-2 min-h-[500px]',  // 0: большая hero
    'col-span-2 min-h-[240px]',              // 1: горизонтальная
    'col-span-2 min-h-[240px]',              // 2: горизонтальная
    'col-span-1 min-h-[300px]',              // 3: вертикальная
    'col-span-1 min-h-[300px]',              // 4: вертикальная
    'col-span-2 min-h-[300px]',              // 5: горизонтальная
    'col-span-2 row-span-2 min-h-[500px]',  // 6: большая
    'col-span-2 min-h-[240px]',              // 7: горизонтальная
  ];
  return patterns[index % 8];
};

// Адаптивные классы для мобильных устройств
const getResponsiveClasses = () => {
  return 'max-sm:!col-span-1 max-sm:!row-span-1 max-sm:!min-h-[300px]';
};

// Градиенты для карточек
const gradients = [
  'from-violet-500 to-purple-600',      // 0
  'from-pink-500 to-rose-600',          // 1
  'from-cyan-400 to-blue-500',          // 2
  'from-emerald-400 to-teal-500',       // 3
  'from-orange-400 to-pink-500',        // 4
  'from-indigo-500 to-purple-900',      // 5
  'from-teal-300 to-pink-300',          // 6
  'from-rose-400 to-pink-300',          // 7
];

const BentoArticlesFeed: FC<BentoArticlesFeedProps> = ({ initialArticles, excludeTag = null, includeTag = null }) => {
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

  // Reset feed when include/exclude tag or initialArticles change
  useEffect(() => {
    setArticles(initialArticles);
    setOffset(initialArticles.length);
    setHasMore(initialArticles.length >= API_PAGE_SIZE);
    setInfiniteDone(false);
    offsetRef.current = initialArticles.length;
    loadingRef.current = false;
    hasMoreRef.current = initialArticles.length >= API_PAGE_SIZE;
    
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[BentoArticlesFeed] reset', { includeTag, excludeTag, initialCount: initialArticles.length });
    }
  }, [includeTag, excludeTag, initialArticles]);

  // Update refs when state changes
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);
  
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  // Intersection Observer для анимации появления карточек
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.remove('opacity-0', 'translate-y-8');
            entry.target.classList.add('opacity-100', 'translate-y-0');
          }
        });
      },
      { 
        threshold: 0.1,
        rootMargin: '50px'
      }
    );

    const cards = document.querySelectorAll('.bento-card');
    cards.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, [articles]);

  // IntersectionObserver для infinite scroll (отдельный от анимации)
  useEffect(() => {
    if (infiniteDone) return;
    const node = loaderRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !loadingRef.current && hasMoreRef.current) {
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[BentoArticlesFeed] loading more', { offset: offsetRef.current, includeTag, excludeTag });
          }
          
          setLoading(true);
          const q = new URLSearchParams({ offset: String(offsetRef.current), limit: String(API_PAGE_SIZE) });
          if (excludeTag) q.set('excludeTag', excludeTag);
          if (includeTag) q.set('includeTag', includeTag);
          
          fetch(`/api/articles?${q.toString()}`)
            .then((res) => res.json())
            .then((data) => {
              if (!Array.isArray(data) || data.length === 0) {
                setInfiniteDone(true);
                setHasMore(false);
                return;
              }
              setArticles((prev) => [...prev, ...data]);
              setOffset((prev) => prev + data.length);
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

  // Периодическая ревалидация начальных статей
  const fetchInitial = useRef<() => Promise<void>>();
  fetchInitial.current = async () => {
    try {
      const q = new URLSearchParams({ offset: '0', limit: String(API_PAGE_SIZE) });
      if (excludeTag) q.set('excludeTag', excludeTag);
      if (includeTag) q.set('includeTag', includeTag);
      const res = await fetch(`/api/articles?${q.toString()}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setArticles((prev) => {
          const incomingIds = new Set(data.map((a: Article) => a.id));
          const remaining = prev.filter((p) => !incomingIds.has(p.id));
          return [...data, ...remaining];
        });
        setOffset((prev) => Math.max(prev, data.length));
        setHasMore(data.length >= API_PAGE_SIZE);
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[BentoArticlesFeed] revalidate failed', e);
      }
    }
  };

  useEffect(() => {
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
      <div className="
        grid 
        grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 
        gap-5
        auto-rows-min
      ">
        {articles.map((article, index) => {
          const isLarge = index % 8 === 0 || index % 8 === 6;
          
          return (
            <article 
              key={article.id}
              className={`
                bento-card
                relative group rounded-2xl overflow-hidden 
                ${getGridClasses(index)}
                ${getResponsiveClasses()}
                shadow-lg hover:shadow-2xl
                dark:shadow-black/20 dark:hover:shadow-black/40
                opacity-0 translate-y-8
                transition-all duration-700 ease-out
              `}
              style={{ transitionDelay: `${(index % 8) * 100}ms` }}
              role="listitem"
            >
              {/* Gradient Background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${gradients[index % 8]} opacity-90 dark:opacity-100`} />
              
              {/* Image */}
              <Link href={`/${article.slug}`} className="block relative h-full">
                {article.preview_image ? (
                  <SafeImage 
                    src={article.preview_image}
                    alt={article.title}
                    fill
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-6xl opacity-50 dark:opacity-40">🎨</span>
                  </div>
                )}
                
                {/* Content Overlay - адаптивный под темы */}
                <div className="
                  absolute bottom-0 left-0 right-0 h-2/3 
                  bg-gradient-to-t 
                  from-gray-900/85 via-gray-900/50 to-transparent
                  dark:from-black/90 dark:via-black/60 dark:to-transparent
                  p-6 flex flex-col justify-end 
                  transition-all duration-300 
                  group-hover:from-gray-900/90 group-hover:via-gray-900/60
                  dark:group-hover:from-black/95 dark:group-hover:via-black/70
                ">
                  
                  {/* Icon для больших карточек */}
                  {isLarge && (
                    <div className="mb-4 text-4xl opacity-90 drop-shadow-lg">✨</div>
                  )}
                  
                  <h3 className={`
                    font-bold text-white mb-3 line-clamp-2 drop-shadow-lg
                    ${isLarge ? 'text-2xl sm:text-3xl lg:text-4xl' : 'text-xl sm:text-2xl'}
                  `}>
                    {article.title}
                  </h3>
                  
                  {(article.excerpt || article.description) && (
                    <p className="
                      text-sm sm:text-base 
                      text-gray-100 dark:text-gray-200 
                      line-clamp-2 drop-shadow-md
                      opacity-0 translate-y-2 
                      group-hover:opacity-100 group-hover:translate-y-0 
                      transition-all duration-300
                    ">
                      {article.excerpt || article.description}
                    </p>
                  )}
                </div>
              </Link>
              
              {/* Edit Button (top-right) */}
              <div className="absolute top-3 right-3 z-20">
                <EditButton contentType="article" contentId={article.id} variant="compact" />
              </div>
            </article>
          );
        })}
      </div>
      
      {/* Loader для infinite scroll */}
      <div ref={loaderRef} className="w-full h-8 mt-6 flex items-center justify-center">
        {loading && (
          <div className="text-gray-500 dark:text-gray-400 text-sm">
            Загрузка...
          </div>
        )}
      </div>
    </div>
  );
};

export default BentoArticlesFeed;
