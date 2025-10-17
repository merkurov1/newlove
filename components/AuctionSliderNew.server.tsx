import React from 'react';
import AuctionSliderNew from './AuctionSliderNew';

export default function AuctionSliderNewServer({ articles, tagDebugInfo }: { articles?: any[], tagDebugInfo?: any }) {
  const has = Array.isArray(articles) && articles.length > 0;

  // Ensure predictable client shape; fall back to placeholder when empty
  const placeholder = [{ id: 'placeholder-auction', title: 'Пока нет аукционных статей', slug: '/', previewImage: null, description: 'Здесь будут показаны статьи с тегом "auction".' }];
  const normalized = (Array.isArray(articles) && articles.length > 0 ? articles : placeholder).map((a: any) => ({
    id: a && (a.id || a._id || a.article_id || a.articleId) ? (a.id || a._id || a.article_id || a.articleId) : String(a && (a.slug || a.title) || 'placeholder'),
    title: a && (a.title || (a.article && a.article.title)) ? (a.title || (a.article && a.article.title)) : 'Без названия',
    slug: a && (a.slug || (a.article && a.article.slug)) ? (a.slug || (a.article && a.article.slug)) : '/',
    previewImage: a && (a.previewImage || a.preview_image) ? (a.previewImage || a.preview_image) : null,
    description: a && (a.description || a.excerpt) ? (a.description || a.excerpt) : null,
  }));

  const safeStringify = (v: any) => {
    try { return JSON.stringify(v, null, 2); } catch (e) { try { return String(v); } catch (ee) { return '<<err>>'; } }
  };

  return (
    <div>
      <div className="mb-3 text-sm text-gray-600">Аукционных статей: {has ? (articles || []).length : 0}</div>
      <AuctionSliderNew articles={normalized} />
      {tagDebugInfo && (
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 text-sm text-gray-700 rounded">
          <div className="font-medium mb-2">DEBUG (Аукцион) — информация по поиску тегов</div>
          <pre className="whitespace-pre-wrap overflow-x-auto text-xs font-mono">{safeStringify(tagDebugInfo)}</pre>
        </div>
      )}
    </div>
  );
}

