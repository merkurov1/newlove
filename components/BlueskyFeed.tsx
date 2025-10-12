'use client';

import { useState, useEffect } from 'react';

interface BlueskyAuthor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface BlueskyRecord {
  text: string;
  createdAt: string;
  langs?: string[];
}

interface BlueskyImage {
  url: string;
  alt?: string;
}

interface BlueskyPost {
  uri: string;
  cid: string;
  author: BlueskyAuthor;
  record: BlueskyRecord;
  replyCount: number;
  repostCount: number;
  likeCount: number;
  images?: BlueskyImage[];
}

interface BlueskyFeedProps {
  limit?: number;
}

export default function BlueskyFeed({ limit = 10 }: BlueskyFeedProps) {
  const [posts, setPosts] = useState<BlueskyPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPosts() {
      try {
        setLoading(true);
        const response = await fetch(`/api/bluesky/posts?limit=${limit}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }
        
        setPosts(data.posts || []);
      } catch (err) {
        console.error('Error fetching Bluesky posts:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchPosts();
  }, [limit]);

  if (loading) {
    return (
      <div className="bluesky-feed">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Загружаем посты из Bluesky...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bluesky-feed">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <p className="text-red-800">Ошибка загрузки Bluesky: {error}</p>
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
      <div className="bluesky-feed">
        <div className="text-center py-8 text-gray-600">
          <p>Пока нет постов для отображения</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bluesky-feed space-y-4">
      <h3 className="text-xl font-bold text-gray-800 mb-4">
        📡 Лента Bluesky
      </h3>
      
      {posts.map((post) => (
        <div 
          key={post.uri} 
          className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center mb-3">
            {post.author.avatar && (
              <img 
                src={post.author.avatar} 
                alt={post.author.displayName ? `Аватар: ${post.author.displayName}` : post.author.handle ? `Аватар: ${post.author.handle}` : 'Аватар пользователя'}
                className="w-10 h-10 rounded-full mr-3"
              />
            )}
            <div>
              <div className="font-semibold text-gray-900">
                {post.author.displayName || post.author.handle}
              </div>
              <div className="text-sm text-gray-500">
                @{post.author.handle}
              </div>
            </div>
          </div>

          <div className="mb-3">
            <p className="text-gray-800 whitespace-pre-wrap">{post.record.text}</p>
          </div>

          {/* Изображения */}
          {post.images && post.images.length > 0 && (
            <div className="mb-3">
              <div className={`grid gap-2 ${
                post.images.length === 1 ? 'grid-cols-1' :
                post.images.length === 2 ? 'grid-cols-2' :
                post.images.length === 3 ? 'grid-cols-2' :
                'grid-cols-2'
              }`}>
                {post.images.map((image, index) => (
                  <div 
                    key={index} 
                    className={`relative overflow-hidden rounded-lg ${
                      post.images!.length === 3 && index === 0 ? 'col-span-2' : ''
                    }`}
                  >
                    <img 
                      src={image.url} 
                      alt={image.alt ? `Bluesky: ${image.alt}` : `Bluesky изображение ${index + 1}`}
                      className="w-full h-auto max-h-96 object-cover hover:scale-105 transition-transform cursor-pointer"
                      onClick={() => window.open(image.url, '_blank')}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center text-sm text-gray-500 border-t pt-3">
            <div className="flex space-x-4">
              <span>💬 {post.replyCount}</span>
              <span>🔄 {post.repostCount}</span>
              <span>❤️ {post.likeCount}</span>
            </div>
            <div>
              {new Date(post.record.createdAt).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
