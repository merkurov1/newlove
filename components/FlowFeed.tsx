'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import SafeImage from '@/components/SafeImage';

interface FlowItem {
  id: string;
  type: 'bluesky' | 'medium' | 'youtube';
  platform: string;
  platformIcon: string;
  platformColor: string;
  title: string;
  content: string;
  url: string;
  author: string;
  authorHandle?: string;
  authorAvatar?: string;
  publishedAt: string;
  timestamp: number;
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

export default function FlowFeed({ limit = 7 }: FlowFeedProps) {
  const [items, setItems] = useState<FlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFlow = async () => {
      try {
        const response = await fetch('/api/flow');
        if (!response.ok) throw new Error('Failed to fetch flow');
        const data = await response.json();
        setItems(data.items?.slice(0, limit) || []);
      } catch (err) {
        setError('Не удалось загрузить ленту');
        console.error('Flow fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFlow();
  }, [limit]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'только что';
    if (diffInHours < 24) return `${diffInHours}ч назад`;
    if (diffInHours < 48) return 'вчера';
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}д назад`;
    
    return date.toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const formatStats = (item: FlowItem) => {
    const stats = item.stats;
    if (!stats) return null;

    // Показываем статистику только для YouTube
    if (item.type === 'youtube') {
      return (
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {stats.views !== undefined && (
            <span className="flex items-center gap-1">
              <span>👁️</span>
              {stats.views.toLocaleString()}
            </span>
          )}
          {stats.likes !== undefined && (
            <span className="flex items-center gap-1">
              <span>👍</span>
              {stats.likes}
            </span>
          )}
          {stats.comments !== undefined && (
            <span className="flex items-center gap-1">
              <span>💬</span>
              {stats.comments}
            </span>
          )}
        </div>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="w-full px-0" style={{background: 'linear-gradient(120deg, #ffe4ef 0%, #fff 100%)'}}>
        <div className="grid gap-8 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" style={{width:'100vw',marginLeft:'calc(50% - 50vw)'}}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white/80 rounded-xl shadow-xl min-h-[320px] aspect-[2/1]" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full px-0" style={{background: 'linear-gradient(120deg, #ffe4ef 0%, #fff 100%)'}}>
        <div className="text-center text-red-600 py-8">⚠️ {error}</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="w-full px-0" style={{background: 'linear-gradient(120deg, #ffe4ef 0%, #fff 100%)'}}>
        <div className="text-center text-gray-600 py-8">📭 Лента пуста — новый контент появится здесь</div>
      </div>
    );
  }

  return (
    <div className="w-full px-0" style={{background: 'linear-gradient(120deg, #ffe4ef 0%, #fff 100%)'}}>
      <div className="grid gap-8 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" style={{width:'100vw',marginLeft:'calc(50% - 50vw)'}}>
        {items.map((item, idx) => (
          <article
            key={item.id}
            className="flex flex-col group animate-fade-in-up min-w-0 max-w-full"
            style={{ animationDelay: `${idx * 100}ms`, animationFillMode: "both" }}
            role="listitem"
          >
            <Link
              href={item.url}
              className="block relative w-full aspect-[2/1] group min-w-0 overflow-hidden"
              aria-label={`Открыть материал: ${item.title}`}
              style={{background:'#fff', minHeight:320}}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.linkPreview?.image || item.thumbnail ? (
                <SafeImage
                  src={item.linkPreview?.image || item.thumbnail}
                  alt={item.title}
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
              <Link href={item.url} target="_blank" rel="noopener noreferrer">
                <h3 className="text-xl font-semibold text-gray-900 mb-1 line-clamp-2 break-words leading-snug max-w-full group-hover:text-pink-500 group-hover:underline">
                  {item.title}
                </h3>
              </Link>
              {item.content && (
                <p className="text-gray-700 text-base line-clamp-2 mt-1 break-words max-w-full">{item.content}</p>
              )}
              {item.publishedAt && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-400">
                    {formatDate(item.publishedAt)}
                  </span>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}