import React from 'react';
import AuctionSliderNew from './AuctionSliderNew';

export default function AuctionSliderNewServer({ articles, tagDebugInfo }: { articles?: any[], tagDebugInfo?: any }) {
  // If there are no articles, provide a safe placeholder so the UI
  // remains visible and consistent. This avoids returning null from
  // the server component which would hide the entire slot under Hero.
    const has = Array.isArray(articles) && articles.length > 0;

    // Always render a visible banner so the slot under Hero is not empty.
    // If there are no real articles, show a minimal placeholder inside the client slider.
    const placeholder = [{
      id: 'placeholder-auction',
      title: 'Пока нет аукционных статей',
      slug: '/',
      previewImage: null,
      description: 'Здесь будут показаны статьи с тегом "auction".'
    }];

    // Ensure each article has a minimal, safe shape for the client slider.
    const normalizeForClient = (a: any) => {
      if (!a || typeof a !== 'object') return { id: String(a || 'unknown'), title: String(a || ''), slug: '/', previewImage: null, description: null };
      return {
        id: a.id || a._id || a.article_id || a.articleId || (a.article && (a.article.id || a.article._id)) || String(a.slug || a.title || 'unknown'),
        title: a.title || (a.article && a.article.title) || 'Без названия',
        slug: a.slug || (a.article && a.article.slug) || '/',
        previewImage: a.previewImage || a.preview_image || (a.content ? null : null) || null,
        description: a.description || a.excerpt || a.preview || null,
      };
    };

    const toRender = has ? (Array.isArray(articles) ? articles.map(normalizeForClient) : placeholder) : placeholder;

    return (
      <div>
        {/* Small count/banner visible server-side */}
        <div className="mb-3 text-sm text-gray-600">Аукционных статей: {has ? articles.length : 0}</div>
        <AuctionSliderNew articles={toRender} />
      </div>
    );
}

