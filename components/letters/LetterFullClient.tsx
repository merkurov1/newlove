"use client";

import { useEffect, useState } from 'react';
import BlockRenderer from '@/components/BlockRenderer';

export default function LetterFullClient({ slug, initialTeaser }: { slug: string; initialTeaser: any[] }) {
  const [blocks, setBlocks] = useState<any[] | null>(initialTeaser || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchFull() {
      setLoading(true);
      try {
        const res = await fetch(`/api/letters/full/${encodeURIComponent(slug)}`, { credentials: 'same-origin' });
        if (res.status === 200) {
          const data = await res.json();
          if (mounted) setBlocks(data.blocks || []);
        } else if (res.status === 401) {
          // unauthenticated - keep teaser
        } else {
          const json = await res.json().catch(() => ({}));
          setError(json.error || 'failed');
        }
      } catch (e) {
        setError(String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchFull();
    return () => { mounted = false; };
  }, [slug]);

  return (
    <div>
      {loading && <div className="text-sm text-gray-500 mb-2">Загрузка полного текста...</div>}
      {error && <div className="text-sm text-red-600 mb-2">Ошибка: {error}</div>}
      {blocks && blocks.length > 0 ? <BlockRenderer blocks={blocks} /> : <p className="italic text-gray-500">Содержимое недоступно.</p>}
    </div>
  );
}
