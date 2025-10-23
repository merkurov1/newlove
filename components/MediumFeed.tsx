'use client';

import React, { useState, useEffect } from 'react';

interface MediumPost {
  title: string;
  link: string;
  publishedAt: string;
  author: string;
  excerpt: string;
  categories: string[];
  id: string;
  readTime: string;
}

interface MediumFeedProps {
  limit?: number;
}

export default function MediumFeed({ limit = 10 }: MediumFeedProps) {
  const [posts, setPosts] = useState<MediumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPosts() {
      try {
        setLoading(true);
        const response = await fetch(`/api/medium/posts?limit=${limit}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }
        
        setPosts(data.posts || []);
      } catch (err) {
        console.error('Error fetching Medium posts:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchPosts();
  }, [limit]);

  if (loading) {
    return (
      <div className="medium-feed">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Загружаем статьи с Medium...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="medium-feed">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <p className="text-red-800">Ошибка загрузки Medium: {error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="medium-feed">
        <div className="text-center py-8 text-gray-600">
          <p>Пока нет статей для отображения</p>
        </div>
      </div>
    );
  }

  return (
    <div className="medium-feed">
      <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
        📝 Статьи на Medium
        <span className="ml-2 text-sm font-normal text-gray-500">
          ({posts.length})
        </span>
      </h3>
      
      <div className="space-y-6">
        {posts.map((post) => (
          <article 
            key={post.id} 
            className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow group"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 rounded-full p-2">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75S24 8.83 24 12z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{post.author}</p>
                  <p className="text-xs text-gray-500">Medium</p>
                </div>
              </div>
              <div className="text-sm text-gray-500">
                {post.readTime}
              </div>
            </div>

            {/* Заголовок */}
            <h2 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-green-700 transition-colors">
              <a 
                href={post.link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:underline"
                aria-label={`Читать статью на Medium: ${post.title}`}
              >
                {post.title}
              </a>
            </h2>

            {/* Превью текста */}
            <p className="text-gray-700 mb-4 leading-relaxed">
              {post.excerpt}
            </p>

            {/* Теги и метаинформация */}
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {post.categories.slice(0, 3).map((category, index) => (
                  <span 
                    key={index}
                    className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
                  >
                    {category}
                  </span>
                ))}
                {post.categories.length > 3 && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                    +{post.categories.length - 3}
                  </span>
                )}
              </div>
              
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <time>
                  {new Date(post.publishedAt).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}
                </time>
                <a 
                  href={post.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-green-600 hover:text-green-700 font-medium flex items-center"
                  aria-label={`Читать на Medium: ${post.title}`}
                >
                  Читать на Medium
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Ссылка на весь профиль */}
      <div className="mt-8 text-center">
        <a 
          href="https://medium.com/@merkurov" 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          aria-label="Все статьи на Medium"
        >
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75S24 8.83 24 12z"/>
          </svg>
          Все статьи на Medium
        </a>
      </div>
    </div>
  );
}