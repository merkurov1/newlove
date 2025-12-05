'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Letter {
  id: string;
  title: string;
  slug: string;
  publishedAt?: string;
  createdAt?: string;
  author?: { name?: string };
}

export default function LettersArchiveClient({
  initialLetters = [],
  initialLastUpdated = null,
}: {
  initialLetters?: Letter[];
  initialLastUpdated?: string | null;
}) {
  const [letters, setLetters] = useState<Letter[]>(initialLetters || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialLastUpdated || null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/letters?cacheBust=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (Array.isArray(body.letters)) {
        setLetters(body.letters);
        if (body.letters.length > 0) {
          setLastUpdated(body.letters[0].publishedAt || body.letters[0].createdAt || null);
        }
      } else {
        setError('Invalid response');
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-gray-500">
          {lastUpdated ? `Last update: ${new Date(lastUpdated).toLocaleString('en-US')}` : ''}
        </div>
        <div>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Updating...' : 'Refresh archive'}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 mb-3">Error: {error}</div>}

      <div className="space-y-4">
        {letters.map((letter) => (
          <article
            key={letter.id}
            className="group border border-blue-50 rounded-xl p-4 bg-white/90 hover:border-blue-200 hover:shadow transition-all duration-200"
          >
            <Link href={`/journal/${letter.slug}`} className="block">
              <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors mb-1">
                {letter.title}
              </h3>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{letter.author?.name || 'Author'}</span>
                <time dateTime={letter.publishedAt || letter.createdAt}>
                  {formatDate(letter.publishedAt || letter.createdAt)}
                </time>
              </div>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
