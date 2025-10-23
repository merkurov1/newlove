 'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SafeImage from '@/components/SafeImage';

interface FlowItem {
  id: string;
  type?: string;
  platform: string;
  platformIcon: string;
  platformColor?: string;
  title: string;
  content?: string;
  url: string;
  author?: string;
  authorHandle?: string;
  authorAvatar?: string;
  publishedAt?: string;
  timestamp?: number;
  images?: string[];
  thumbnail?: string;
  duration?: string;
  readingTime?: string;
  categories?: string[];
  stats?: {
    likes?: number;
    reposts?: number;
    replies?: number;
    views?: number;
    comments?: number;
  };
  linkPreview?: {
    url: string;
    title?: string;
    description?: string;
    image?: string;
  } | null;
}

interface FlowFeedProps {
  limit?: number;
}

export default function FlowFeed({ limit = 8 }: FlowFeedProps) {
  const [items, setItems] = useState<FlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchFlow = async () => {
      try {
        const res = await fetch('/api/flow');
        if (!res.ok) throw new Error('Failed to fetch flow');
        const data = await res.json();
        if (mounted) setItems(data.items?.slice(0, limit) || []);
      } catch (err) {
        console.error('Flow fetch error:', err);
        if (mounted) setError('Не удалось загрузить ленту');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchFlow();
    return () => {
      mounted = false;
    };
  }, [limit]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
      if (diffHours < 1) return 'только что';
      if (diffHours < 24) return `${diffHours}ч назад`;
      if (diffHours < 48) return 'вчера';
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}д назад`;
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch (e) {
      return dateString || '';
    }
  };

  const renderPlatformBadge = (item: FlowItem) => (
    <div
      className="absolute left-3 top-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium text-white shadow"
      style={{ background: item.platformColor || 'rgba(0,0,0,0.6)' }}
    >
      <span className="text-sm leading-none" aria-hidden>
        {item.platformIcon}
      </span>
      <span className="truncate max-w-[90px]">{item.platform}</span>
    </div>
  );

  if (loading) {
    return (
      <div className="w-full px-2 md:px-8 2xl:px-32">
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-xl shadow min-h-[220px] overflow-hidden">
              <div className="bg-gray-200 aspect-[16/9] w-full" />
              <div className="p-4">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full px-2 md:px-8 2xl:px-32">
        <div className="text-center text-red-600 py-8">⚠️ {error}</div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="w-full px-2 md:px-8 2xl:px-32">
        <div className="text-center text-gray-600 py-8">📰 Лента пуста — новый контент появится здесь</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="grid gap-4 sm:gap-6 overflow-x-hidden" style={{gridTemplateColumns:'repeat(auto-fit, minmax(180px,1fr))'}}>
        {items.slice(0, Math.min(8, items.length)).map((item) => {
          const imageSrc = item.linkPreview?.image || item.thumbnail || (item.images && item.images[0]);
          return (
            <article
              key={item.id}
              className="group bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden flex flex-col"
              role="listitem"
            >
              <div className="relative w-full">
                {imageSrc ? (
                  <Link href={item.url} target="_blank" rel="noopener noreferrer" className="block w-full">
                    <div className="relative w-full aspect-[16/9] overflow-hidden bg-gray-50">
                      <SafeImage
                        src={imageSrc}
                        alt={item.title || 'preview'}
                        fill
                        sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    </div>
                  </Link>
                ) : (
                  <div className="w-full aspect-[16/9] bg-gradient-to-br from-gray-100 to-white flex items-center justify-center text-gray-400">
                    <span className="text-sm">Без превью</span>
                  </div>
                )}

                {renderPlatformBadge(item)}
              </div>

              <div className="p-5 flex-1 flex flex-col">
                <Link href={item.url} target="_blank" rel="noopener noreferrer" className="group">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-pink-600 transition-colors">
                    {item.title}
                  </h3>
                </Link>

                {item.content && <p className="text-gray-700 text-sm line-clamp-2 mb-4">{item.content}</p>}

                <div className="mt-auto flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center gap-3">
                    {item.authorAvatar ? (
                      <SafeImage
                        src={item.authorAvatar}
                        alt={item.author ? `Аватар автора: ${item.author}` : 'Аватар автора'}
                        width={28}
                        height={28}
                        className="rounded-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-200" />
                    )}
                    <div className="leading-tight">
                      <div className="text-xs text-gray-700">{item.author}</div>
                      <div className="text-xs text-gray-400">{formatDate(item.publishedAt)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {item.stats?.views !== undefined && (
                      <span className="flex items-center gap-1">👁️ {item.stats.views.toLocaleString()}</span>
                    )}
                    {item.stats?.likes !== undefined && (
                      <span className="flex items-center gap-1">❤️ {item.stats.likes}</span>
                    )}
                    {item.stats?.reposts !== undefined && (
                      <span className="flex items-center gap-1">🔁 {item.stats.reposts}</span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}