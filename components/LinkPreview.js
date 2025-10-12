// components/LinkPreview.js
'use client';
import { useEffect, useState } from 'react';

export default function LinkPreview({ url }) {
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMeta() {
      setLoading(true);
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error('Ошибка загрузки превью');
        const data = await res.json();
        setMeta(data);
      } catch {
        setMeta(null);
      } finally {
        setLoading(false);
      }
    }
    fetchMeta();
  }, [url]);

  if (loading) return <div className="mt-2 text-xs text-gray-400">Загрузка превью...</div>;
  if (!meta) return null;

  return (
  <a href={url} target="_blank" rel="noopener noreferrer" className="block border rounded-lg p-3 mt-2 bg-gray-50 hover:bg-gray-100 transition" aria-label={`Внешняя ссылка: ${meta.title || url}`}> 
      {meta.image && <img src={meta.image} alt={meta.title ? `Превью: ${meta.title}` : 'Превью'} className="w-full h-32 object-cover rounded mb-2" />}
      <div className="font-semibold text-gray-900 mb-1">{meta.title}</div>
      <div className="text-xs text-gray-500 mb-1">{meta.siteName}</div>
      <div className="text-sm text-gray-700 line-clamp-2">{meta.description}</div>
    </a>
  );
}
