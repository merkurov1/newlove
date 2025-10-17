import React from 'react';
import AuctionSliderNew from './AuctionSliderNew';

export default function AuctionSliderNewServer({ articles, tagDebugInfo }: { articles?: any[], tagDebugInfo?: any }) {
  const has = Array.isArray(articles) && articles.length > 0;
  if (!has) return null;

  // Normalize for client: ensure stable shape
  const normalized = Array.isArray(articles) ? articles.map((a: any) => ({
    id: a.id || a._id || String(a.slug || a.title || ''),
    title: a.title || (a.article && a.article.title) || 'Без названия',
    slug: a.slug || (a.article && a.article.slug) || '/',
    previewImage: a.previewImage || a.preview_image || null,
    description: a.description || a.excerpt || null,
  })) : [];

  return (
    <div>
      <div className="mb-3 text-sm text-gray-600">Аукционных статей: {normalized.length}</div>
      <AuctionSliderNew articles={normalized} />
    </div>
  );
}

