import React from 'react';
import Image from 'next/image';

// Server-only wrapper: render a static preview grid based on provided articles.
// IMPORTANT: do NOT import any client-only components here. The interactive
// Swiper slider is mounted separately on the client by `components/AuctionSlider.tsx`.
export default function AuctionSliderNewServer({ articles, tagDebugInfo }: { articles?: any[], tagDebugInfo?: any }) {
  const list = Array.isArray(articles) && articles.length > 0 ? articles : [];

  const normalized = list.map((a: any) => ({
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {normalized.slice(0, 6).map(a => (
          <a key={String(a.id)} href={`/${a.slug}`} className="block rounded-lg overflow-hidden shadow-sm bg-white dark:bg-neutral-900">
            {a.previewImage ? (
              <div className="h-40 w-full bg-gray-100 dark:bg-neutral-800 relative">
                <Image src={String(a.previewImage)} alt={a.title || ''} className="object-cover" fill sizes="(max-width: 768px) 100vw, 33vw" />
              </div>
            ) : (
              <div className="h-40 w-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">📰</div>
            )}
            <div className="p-3">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{a.title}</h3>
              {a.description ? <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{a.description}</p> : null}
            </div>
          </a>
        ))}
      </div>

      {tagDebugInfo && (
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 text-sm text-gray-700 rounded">
          <div className="font-medium mb-2">DEBUG (Аукцион) — информация по поиску тегов</div>
          <pre className="whitespace-pre-wrap overflow-x-auto text-xs font-mono">{safeStringify(tagDebugInfo)}</pre>
        </div>
      )}
    </div>
  );
}

