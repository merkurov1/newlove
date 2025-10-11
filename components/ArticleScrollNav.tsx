"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Article {
  id: string;
  slug: string;
  title: string;
  content: string;
  publishedAt?: string;
}
type ArticleScrollNavProps = {
  article: Article;
  prev: Article | null;
  next: Article | null;
};

export default function ArticleScrollNav({ article, prev, next }: ArticleScrollNavProps) {
  const [current, setCurrent] = useState<Article>(article);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (current.slug !== article.slug) {
      window.history.pushState({}, '', `/${current.slug}`);
    }
  }, [current.slug]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const topSentinel = document.createElement('div');
    const bottomSentinel = document.createElement('div');
    topSentinel.style.height = '1px';
    bottomSentinel.style.height = '1px';
    container.insertBefore(topSentinel, container.firstChild);
    container.appendChild(bottomSentinel);

    const observer = new window.IntersectionObserver(
      async (entries) => {
        if (loading) return;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target === bottomSentinel && next) {
            setLoading(true);
            const res = await fetch(`/api/article-by-slug?slug=${next.slug}`);
            const data = await res.json();
            setCurrent(data);
            setLoading(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else if (entry.isIntersecting && entry.target === topSentinel && prev) {
            setLoading(true);
            const res = await fetch(`/api/article-by-slug?slug=${prev.slug}`);
            const data = await res.json();
            setCurrent(data);
            setLoading(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      },
      { root: null, threshold: 1.0 }
    );
    observer.observe(topSentinel);
    observer.observe(bottomSentinel);
    return () => {
      observer.disconnect();
      topSentinel.remove();
      bottomSentinel.remove();
    };
  }, [prev, next, loading]);

  return (
  <div ref={containerRef} className="min-h-screen flex flex-col items-center justify-center px-2 py-10">
      <article className="prose prose-lg max-w-2xl w-full bg-white/80 p-8 rounded-xl shadow-xl">
        <h1 className="mb-2 text-3xl font-bold">{current.title}</h1>
        <div className="mb-6 text-xs text-gray-400">{current.publishedAt ? new Date(current.publishedAt).toLocaleDateString('ru-RU') : ''}</div>
        <div dangerouslySetInnerHTML={{ __html: current.content }} />
      </article>
      <div className="flex justify-between w-full max-w-2xl mt-8">
        {prev ? (
          <span className="text-blue-500">← {prev.title}</span>
        ) : <span />}
        {next ? (
          <span className="text-blue-500">{next.title} →</span>
        ) : <span />}
      </div>
      {loading && <div className="mt-4 text-gray-400">Загрузка...</div>}
    </div>
  );
}
