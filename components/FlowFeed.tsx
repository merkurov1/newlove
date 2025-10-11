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
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="p-4 animate-pulse">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-gray-200"></div>
              <div className="h-4 bg-gray-200 w-32"></div>
              <div className="h-3 bg-gray-200 w-20 ml-auto"></div>
            </div>
            <div className="h-5 bg-gray-200 w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-200 w-full"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-600">⚠️ {error}</div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-4 text-center text-gray-600">📭 Лента пуста — новый контент появится здесь</div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <article 
          key={item.id}
          className="border-t border-gray-200 last:border-b-0"
        >
          {/* Заголовок с платформой и временем */}
          <div className="flex items-center justify-between p-4">
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
          <div className="px-4 pb-4">
            {/* Для Bluesky убираем дублирование: только обычный текст */}
            {item.type === 'bluesky' ? (
              <>
                <div className="text-gray-700 text-sm leading-relaxed mb-4 whitespace-pre-line">
                  {item.content}
                </div>
                {/* OG preview для Bluesky ссылок — только если есть image */}
                {item.linkPreview?.image && (
                  <a
                      href={item.linkPreview.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden mb-4"
                    >
                      <div className="relative w-full aspect-video bg-gray-100">
                        <Image
                          src={item.linkPreview.image}
                          alt={item.linkPreview.title || 'Link preview'}
                          fill
                          className="object-contain"
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
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
                <h3 className="font-semibold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors">
                  {item.title}
                </h3>
                <div className="text-gray-700 text-sm leading-relaxed mb-4">
                  {item.content}
                </div>
              </>
            )}

            {/* Изображения для Bluesky */}
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
                      className="object-contain transition-transform duration-200"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Превью для Medium и YouTube: приоритет linkPreview.image, fallback thumbnail */}
            {(item.type === 'medium' || item.type === 'youtube') && (item.linkPreview?.image || item.thumbnail) && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden mb-4"
              >
                <div className={`relative ${item.type === 'medium' ? 'aspect-[16/9]' : 'aspect-video'} bg-gray-100`}>
                  <Image
                    src={item.linkPreview?.image || item.thumbnail!}
                    alt={item.title}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
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

            {/* Футер с ограниченным контентом */}
            <div className="flex items-center justify-between">
              {item.type === 'youtube' && formatStats(item)}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}