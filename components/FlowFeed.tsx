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
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
              <div className="h-4 bg-gray-200 rounded w-24"></div>
              <div className="h-3 bg-gray-200 rounded w-16 ml-auto"></div>
            </div>
            <div className="h-5 bg-gray-200 rounded w-3/4 mb-3"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <div className="text-red-600 mb-2">⚠️ Ошибка загрузки</div>
        <div className="text-sm text-red-500">{error}</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
        <div className="text-gray-600 mb-2">📭 Лента пуста</div>
        <div className="text-sm text-gray-500">Новый контент появится здесь</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {items.map((item) => (
        <article 
          key={item.id}
          className="bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-200 overflow-hidden group"
        >
          {/* Заголовок с платформой и временем */}
          <div className="flex items-center justify-between p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 ${item.platformColor} rounded-lg flex items-center justify-center text-white text-sm font-medium`}>
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
          <div className="px-6 pb-6">
            {/* Для Bluesky убираем дублирование: только обычный текст */}
            {item.type === 'bluesky' ? (
              <div className="text-gray-700 text-sm leading-relaxed mb-4">
                {item.content}
              </div>
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
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden">
                    <Image
                      src={img}
                      alt=""
                      fill
                      className="object-cover hover:scale-105 transition-transform duration-200"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Превью для YouTube */}
            {item.type === 'youtube' && item.thumbnail && (
              <div className="relative aspect-video rounded-lg overflow-hidden mb-4">
                <Image
                  src={item.thumbnail}
                  alt={item.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center group-hover:bg-black/10 transition-colors">
                  <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-white text-2xl">
                    ▶️
                  </div>
                </div>
                {item.duration && (
                  <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                    {item.duration}
                  </div>
                )}
              </div>
            )}

            {/* Превью для Medium */}
            {item.type === 'medium' && item.thumbnail && (
              <div className="relative aspect-[16/9] rounded-lg overflow-hidden mb-4">
                <Image
                  src={item.thumbnail}
                  alt={item.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
              </div>
            )}

            {/* Футер с ограниченным контентом */}
            <div className="flex items-center justify-between">
              {/* Показываем статистику только для YouTube */}
              {item.type === 'youtube' && formatStats(item)}
              
              {/* Показываем ссылку только для YouTube */}
              {item.type === 'youtube' && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
                >
                  Открыть
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}