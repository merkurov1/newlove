"use client";

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import SafeImage from '@/components/SafeImage';

type Article = {
  id?: string | number;
  title?: string;
  slug?: string;
  preview_image?: string | null;
  excerpt?: string | null;
};

interface AuctionGridProps {
  articles: Article[];
}

const AuctionGrid: React.FC<AuctionGridProps> = ({ articles: initialArticles }) => {
  const [articles, setArticles] = useState<Article[]>(initialArticles || []);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialArticles.length >= 10);
  const [offset, setOffset] = useState(initialArticles.length);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  // Infinite scroll observer
  useEffect(() => {
    if (!hasMore) return;
    const node = loaderRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && hasMore) {
          setLoading(true);
          
          fetch(`/api/articles?includeTag=auction&offset=${offset}&limit=10`)
            .then((res) => res.json())
            .then((data) => {
              if (!Array.isArray(data) || data.length === 0) {
                setHasMore(false);
                return;
              }
              setArticles((prev) => [...prev, ...data]);
              setOffset((prev) => prev + data.length);
              if (data.length < 10) setHasMore(false);
            })
            .catch(() => {
              setHasMore(false);
            })
            .finally(() => setLoading(false));
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [offset, loading, hasMore]);

  if (!Array.isArray(articles) || articles.length === 0) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-neutral-900 dark:via-black dark:to-neutral-900 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {articles.map((article) => (
            <Link 
              key={article.id || article.slug}
              href={`/${article.slug}`}
              className="block group"
            >
              <article className="
                relative overflow-hidden rounded-2xl 
                bg-white dark:bg-neutral-800 
                shadow-lg hover:shadow-2xl 
                dark:shadow-black/20 dark:hover:shadow-black/40
                transition-all duration-500
                h-[320px]
              ">
                {/* Image */}
                <div className="relative h-full">
                  {article.preview_image ? (
                    <SafeImage
                      src={article.preview_image}
                      alt={article.title || ''}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-neutral-700 dark:to-neutral-600 flex items-center justify-center">
                      <span className="text-6xl opacity-40">🎨</span>
                    </div>
                  )}
                  
                  {/* Overlay Gradient */}
                  <div className="
                    absolute inset-0 
                    bg-gradient-to-t 
                    from-black/90 via-black/50 to-transparent
                    dark:from-black/95 dark:via-black/60
                    opacity-80 group-hover:opacity-100
                    transition-opacity duration-300
                  " />
                  
                  {/* Content */}
                  <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
                    <h3 className="
                      text-xl sm:text-2xl font-bold 
                      text-white 
                      line-clamp-2 
                      drop-shadow-lg
                      mb-2
                    ">
                      {article.title}
                    </h3>
                    
                    {article.excerpt && (
                      <p className="
                        text-sm text-gray-200 dark:text-gray-300
                        line-clamp-2 
                        drop-shadow-md
                        opacity-0 translate-y-2
                        group-hover:opacity-100 group-hover:translate-y-0
                        transition-all duration-300
                      ">
                        {article.excerpt}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>

        {/* Loader */}
        <div ref={loaderRef} className="w-full h-8 mt-6 flex items-center justify-center">
          {loading && (
            <div className="text-gray-500 dark:text-gray-400 text-sm">
              Загрузка...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuctionGrid;
