'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

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
      <div className="w-full px-0">
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
      <div className="w-full px-0">
        <div className="text-center text-red-600 py-8">⚠️ {error}</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="w-full px-0">
        <div className="text-center text-gray-600 py-8">📭 Лента пуста — новый контент появится здесь</div>
      </div>
    );
  }

  return (
    <div className="w-full px-0">
      <div className="grid gap-8 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" style={{width:'100vw',marginLeft:'calc(50% - 50vw)'}}>
        {items.map((item) => (
          <article 
            key={item.id}
            className="flex flex-col bg-white/80 rounded-xl shadow-xl min-h-[320px] aspect-[2/1] max-w-full"
          >
            {/* Заголовок с платформой и временем */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-3">
                <div className={`${item.platformColor} w-8 h-8 flex items-center justify-center text-white text-sm font-medium`}>
                  {item.platformIcon}
                </div>
                <div>
                  <div className="font-medium text-gray-900">{item.platform}</div>
                  <div className="text-sm text-gray-500">@{item.authorHandle || item.author}</div>
                </div>
              </div>
              <div className="text-sm text-gray-500">
                {formatDate(item.publishedAt)}
              </div>
            </div>

            {/* Контент */}
            <div className="flex-1 flex flex-col px-4 pb-4">
              {item.type === 'bluesky' ? (
                <>
                  <div className="text-gray-700 text-sm leading-relaxed mb-4 whitespace-pre-line">
                    {item.content}
                  </div>
                  {item.linkPreview?.image && (
                    <a
                        href={item.linkPreview.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block overflow-hidden mb-4"
                      >
                        <div className="relative w-full aspect-[2/1] bg-gray-100 min-h-[220px]">
                          <Image
                            src={item.linkPreview.image}
                            alt={item.linkPreview.title || 'Link preview'}
                            fill
                            className="object-contain w-full h-full max-h-[420px]"
                            sizes="100vw"
                          />
                        </div>
                        <div className="pt-3">
                          <div className="font-semibold text-gray-900 text-base mb-1 truncate">
                            {item.linkPreview.title || item.linkPreview.url}
                          </div>
                          {item.linkPreview.description && (
                            <div className="text-gray-600 text-sm line-clamp-2 mb-1">
                              {item.linkPreview.description}
                            </div>
                          )}
                          <div className="text-blue-600 text-xs truncate">{item.linkPreview.url}</div>
                        </div>
                      </a>
                  )}
                </>
              ) : (
                <>
                  <h3 className="font-semibold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors text-lg">
                    {item.title}
                  </h3>
                  <div className="text-gray-700 text-sm leading-relaxed mb-4">
                    {item.content}
                  </div>
                </>
              )}

              {item.type === 'bluesky' && item.images && item.images.length > 0 && (
                <div className={`grid gap-2 mb-4 ${
                  item.images.length === 1 ? 'grid-cols-1' :
                  item.images.length === 2 ? 'grid-cols-2' :
                  item.images.length === 3 ? 'grid-cols-3' :
                  'grid-cols-2'
                }`}>
                  {item.images.slice(0, 4).map((img, idx) => (
                    <div key={idx} className="relative aspect-square overflow-hidden">
                      <Image
                        src={img}
                        alt=""
                        fill
                        className="object-contain w-full h-full max-h-[420px] transition-transform duration-200"
                        sizes="100vw"
                      />
                    </div>
                  ))}
                </div>
              )}

              {(item.type === 'medium' || item.type === 'youtube') && (item.linkPreview?.image || item.thumbnail) && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden mb-4"
                >
                  <div className={`relative aspect-[2/1] bg-gray-100 min-h-[220px]`}>
                    <Image
                      src={item.linkPreview?.image || item.thumbnail!}
                      alt={item.title}
                      fill
                      className="object-contain w-full h-full max-h-[420px]"
                      sizes="100vw"
                    />
                    {item.type === 'youtube' && (
                      <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                        <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center text-white text-lg">
                          ▶️
                        </div>
                      </div>
                    )}
                    {item.type === 'youtube' && item.duration && (
                      <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1">
                        {item.duration}
                      </div>
                    )}
                  </div>
                  {item.linkPreview && (
                    <div className="pt-3">
                      <div className="font-semibold text-gray-900 text-base mb-1 truncate">
                        {item.linkPreview.title || item.title}
                      </div>
                      {item.linkPreview.description && (
                        <div className="text-gray-600 text-sm line-clamp-2 mb-1">
                          {item.linkPreview.description}
                        </div>
                      )}
                      <div className="text-blue-600 text-xs truncate">{item.linkPreview.url}</div>
                    </div>
                  )}
                </a>
              )}

              <div className="flex items-center justify-between mt-auto">
                {item.type === 'youtube' && formatStats(item)}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}