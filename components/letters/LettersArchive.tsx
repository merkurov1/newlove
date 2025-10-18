'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Letter {
  id: string;
  title: string;
  slug: string;
  publishedAt: string;
  createdAt: string;
  author: {
    name: string;
  };
}

export default function LettersArchive() {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [debug, setDebug] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLetters = async () => {
      try {
        const response = await fetch('/api/letters', { credentials: 'same-origin' });
        if (!response.ok) {
          // try to parse debug info if present
          try {
            const txt = await response.text();
            try { const j = JSON.parse(txt); setDebug(j.debug || j); } catch { setDebug(txt); }
          } catch (e) { /* ignore */ }
          throw new Error('Failed to fetch letters');
        }

        const data = await response.json();
        setLetters(data.letters || []);
        if (data.debug) setDebug(data.debug);
      } catch (err) {
        setError('Не удалось загрузить архив писем');
        console.error('Letters fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLetters();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-2">⚠️ {error}</div>
        <button
          onClick={() => window.location.reload()}
          className="text-blue-600 hover:underline"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (letters.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-600 mb-2">📭 Архив пуст</div>
        <div className="text-sm text-gray-500">Письма появятся здесь после публикации</div>
        {debug && (
          <pre className="whitespace-pre-wrap text-xs text-left mt-4 bg-gray-50 p-3 rounded">{JSON.stringify(debug, null, 2)}</pre>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {letters.map((letter) => (
        <article
          key={letter.id}
          className="group border border-blue-50 rounded-xl p-4 bg-white/90 hover:border-blue-200 hover:shadow transition-all duration-200"
        >
          <Link href={`/letters/${letter.slug}`} className="block">
            <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors mb-1">
              {letter.title}
            </h3>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{letter.author?.name || 'Автор'}</span>
              <time dateTime={letter.publishedAt || letter.createdAt}>
                {formatDate(letter.publishedAt || letter.createdAt)}
              </time>
            </div>
          </Link>
        </article>
      ))}

      {debug && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700">Debug info</h4>
          <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded mt-2">{JSON.stringify(debug, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}