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

    const toRender = has ? articles : placeholder;

    return (
      <div>
        {/* Small count/banner visible server-side */}
        <div className="mb-3 text-sm text-gray-600">Аукционных статей: {has ? articles.length : 0}</div>
        <AuctionSliderNew articles={toRender} />
        {tagDebugInfo && (
          <div className="mt-4 p-3 bg-gray-50 border border-gray-200 text-sm text-gray-700 rounded">
            <div className="font-medium mb-2">DEBUG: tag exclusion info</div>
            {tagDebugInfo && tagDebugInfo.error ? (
              <pre className="whitespace-pre-wrap text-red-600">{String(tagDebugInfo.error)}</pre>
            ) : (
              <div>
                <div>
                  <strong>tag row:</strong>
                  <span> </span>
                  <span className="break-words">{safeStringify(tagDebugInfo.tagRow, 'not found')}</span>
                </div>
                <div className="mt-2"><strong>relations count:</strong> {Number(tagDebugInfo.relsCount || 0)}</div>
                <div className="mt-2"><strong>excluded ids (sample 50):</strong> <span className="break-words">{safeArraySampleString(tagDebugInfo.excludedIds,50)}</span></div>
                <div className="mt-2"><strong>auctionArticles ids (server RPC):</strong> <span className="break-words">{safeArraySampleString(tagDebugInfo.auctionIds,50)}</span></div>
              </div>
            )}
          </div>
        )}
      </div>
    );
}

  function safeStringify(value: any, fallback = '') {
    try {
      if (value === undefined || value === null) return fallback;
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    } catch (e) {
      try { return String(value); } catch (ee) { return fallback; }
    }
  }

  function safeArraySampleString(val: any, n = 50) {
    try {
      if (!Array.isArray(val)) return safeStringify(val, '[]');
      return JSON.stringify(val.slice(0, n));
    } catch (e) {
      return '[]';
    }
  }
