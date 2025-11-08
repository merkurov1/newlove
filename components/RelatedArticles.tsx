// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";

interface Article {
  id: string;
  title: string;
  slug: string;
  preview_image?: string | null;
  excerpt?: string | null;
  tags?: Array<{ id: string; name: string }>;
}

interface RelatedArticlesProps {
  currentArticleId: string;
  tags?: Array<{ id: string; name: string; slug?: string }>;
  limit?: number;
}

const RelatedArticles = ({ currentArticleId, tags = [], limit = 3 }: RelatedArticlesProps) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRelatedArticles = async () => {
      if (!tags || tags.length === 0) {
        setLoading(false);
        return;
      }

      try {
        // Берем первый тег для поиска похожих статей
        const primaryTag = tags[0];
        const tagSlug = primaryTag.slug || primaryTag.name;
        
        const response = await fetch(`/api/articles?includeTag=${encodeURIComponent(tagSlug)}&limit=${limit + 5}`);
        const data = await response.json();
        
        if (Array.isArray(data)) {
          // Исключаем текущую статью и берем только нужное количество
          const filtered = data
            .filter(article => article.id !== currentArticleId)
            .slice(0, limit);
          setArticles(filtered);
        }
      } catch (error) {
        console.error('Error fetching related articles:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRelatedArticles();
  }, [currentArticleId, tags, limit]);

  if (loading) {
    return (
      <div className="mt-12 pt-8 border-t border-gray-200 dark:border-neutral-700">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Похожие материалы
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-video bg-gray-200 dark:bg-neutral-800 rounded-lg mb-3"></div>
              <div className="h-4 bg-gray-200 dark:bg-neutral-800 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 dark:bg-neutral-800 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (articles.length === 0) {
    return null;
  }

  return (
    <div className="mt-12 pt-8 border-t border-gray-200 dark:border-neutral-700">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Похожие материалы
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {articles.map((article) => (
          <Link
            key={article.id}
            href={`/${article.slug}`}
            className="group block"
          >
            <article className="relative overflow-hidden rounded-lg bg-white dark:bg-neutral-900 shadow-md hover:shadow-xl dark:shadow-black/20 dark:hover:shadow-black/40 transition-all duration-300">
              {/* Image */}
              <div className="aspect-video relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-neutral-800 dark:to-neutral-700">
                {article.preview_image ? (
                  <SafeImage
                    src={article.preview_image}
                    alt={article.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-4xl text-gray-300 dark:text-gray-600">📰</span>
                  </div>
                )}
                
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
              
              {/* Content */}
              <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-2 mb-2 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">
                  {article.title}
                </h3>
                
                {article.excerpt && (
                  <p className="text-sm text-gray-600 dark:text-neutral-400 line-clamp-2">
                    {article.excerpt}
                  </p>
                )}
                
                {/* Tags */}
                {article.tags && article.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {article.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag.id}
                        className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
                      >
                        #{tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default RelatedArticles;
