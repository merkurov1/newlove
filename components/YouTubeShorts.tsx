'use client';

import React, { useState, useEffect } from 'react';

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  duration: string;
  viewCount?: string;
  likeCount?: string;
  channelTitle: string;
  url: string;
}

interface ChannelInfo {
  id: string;
  title: string;
  thumbnail: string;
  subscriberCount?: string;
  videoCount?: string;
}

interface YouTubeShortsProps {
  limit?: number;
}

export default function YouTubeShorts({ limit = 10 }: YouTubeShortsProps) {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsConfig, setNeedsConfig] = useState(false);

  useEffect(() => {
    async function fetchVideos() {
      try {
        setLoading(true);
        const response = await fetch(`/api/youtube/shorts?limit=${limit}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
          setNeedsConfig(data.needsConfig || false);
          throw new Error(data.error);
        }
        
        setVideos(data.videos || []);
        setChannelInfo(data.channelInfo);
      } catch (err) {
        console.error('Error fetching YouTube Shorts:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchVideos();
  }, [limit]);

  // Функция для форматирования количества просмотров
  const formatViewCount = (count?: string) => {
    if (!count) return '0';
    const num = parseInt(count);
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Функция для форматирования времени публикации
  const formatTimeAgo = (publishedAt: string) => {
    const date = new Date(publishedAt);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'только что';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} мин назад`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} ч назад`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} дн назад`;
    return date.toLocaleDateString('ru-RU');
  };

  if (loading) {
    return (
      <div className="youtube-shorts">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Загружаем YouTube Shorts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="youtube-shorts">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <div className="mb-4">
            <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-red-800 mb-2">
            {needsConfig ? 'Требуется настройка' : 'Ошибка загрузки'}
          </h3>
          <p className="text-red-700 mb-4">
            {needsConfig 
              ? 'Нужно указать правильный ID канала YouTube в настройках' 
              : `Ошибка YouTube API: ${error}`
            }
          </p>
          {needsConfig && (
            <div className="bg-white rounded p-4 text-sm text-gray-600">
              <p className="mb-2">Для настройки:</p>
              <ol className="text-left list-decimal list-inside space-y-1">
                <li>Найдите ID канала @heartandangel</li>
                <li>Обновите YOUTUBE_CHANNEL_ID в .env.local</li>
                <li>Перезапустите сервер</li>
              </ol>
            </div>
          )}
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="youtube-shorts">
        <div className="text-center py-8 text-gray-600">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p>Пока нет коротких видео для отображения</p>
        </div>
      </div>
    );
  }

  return (
    <div className="youtube-shorts">
      {/* Header с информацией о канале */}
      {channelInfo && (
        <div className="flex items-center mb-6 p-4 bg-gray-50 rounded-lg">
          {channelInfo.thumbnail && (
            <img 
              src={channelInfo.thumbnail} 
              alt={channelInfo.title}
              className="w-16 h-16 rounded-full mr-4"
            />
          )}
          <div>
            <h3 className="text-xl font-bold text-gray-800 flex items-center">
              🎬 YouTube Shorts: {channelInfo.title}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({videos.length})
              </span>
            </h3>
            <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
              {channelInfo.subscriberCount && (
                <span>👥 {formatViewCount(channelInfo.subscriberCount)} подписчиков</span>
              )}
              {channelInfo.videoCount && (
                <span>📹 {channelInfo.videoCount} видео</span>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Сетка с видео */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {videos.map((video) => (
          <div 
            key={video.id} 
            className="group cursor-pointer"
            onClick={() => window.open(video.url, '_blank')}
          >
            {/* Миниатюра */}
            <div className="relative aspect-[9/16] rounded-lg overflow-hidden bg-gray-200 mb-3">
              <img 
                src={video.thumbnail} 
                alt={video.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
              
              {/* Overlay с информацией */}
              <div className="absolute inset-0 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                <div className="bg-red-600 rounded-full p-3">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              </div>
              
              {/* Индикатор Shorts */}
              <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                Shorts
              </div>
              
              {/* Статистика */}
              {video.viewCount && (
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                  👁 {formatViewCount(video.viewCount)}
                </div>
              )}
            </div>
            
            {/* Информация о видео */}
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-red-600 transition-colors">
                {video.title}
              </h4>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{formatTimeAgo(video.publishedAt)}</span>
                {video.likeCount && (
                  <span className="flex items-center">
                    ❤️ {formatViewCount(video.likeCount)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Ссылка на канал */}
      <div className="mt-8 text-center">
        <a 
          href={`https://youtube.com/${process.env.NEXT_PUBLIC_YOUTUBE_HANDLE || '@heartandangel'}?feature=shorts`}
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          Все Shorts на YouTube
        </a>
      </div>
    </div>
  );
}