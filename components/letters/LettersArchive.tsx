'use client';
// touch: redeploy trigger — updated to force a fresh commit/push

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
  const [lastFetchInfo, setLastFetchInfo] = useState<any>(null);
  const [anonAttempt, setAnonAttempt] = useState<any>(null);

  useEffect(() => {
    const fetchLetters = async () => {
      const url = '/api/letters';
      const wantDebug = typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('debug') === '1';
      try {
        let response: Response | null = null;
        try {
          response = await fetch(url, { credentials: 'same-origin' });
        } catch (e) {
          setLastFetchInfo({ error: String(e) });
          throw e;
        }

        const status = response.status;
        const ok = response.ok;
        const text = await response.text();
        let parsed: any = null;
        try { parsed = JSON.parse(text); } catch { parsed = text; }
        if (!ok) {
          if (wantDebug) {
            try { setDebug(parsed?.debug || parsed); } catch { setDebug(parsed); }
          }
          throw new Error('Failed to fetch letters');
        }

        const data = typeof parsed === 'object' ? parsed : JSON.parse(text);
        setLetters(data.letters || []);
        if (data.debug && wantDebug) setDebug(data.debug);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setError('Не удалось загрузить архив писем — ' + errMsg);
        // only keep minimal error info in UI
        setLastFetchInfo((lf: any) => lf || { error: errMsg });
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