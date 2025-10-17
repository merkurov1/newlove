import React from 'react';
import AuctionSliderNew from './AuctionSliderNew';

export default function AuctionSliderNewServer({ articles }: { articles?: any[] }) {
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
            {tagDebugInfo.error ? (
              <pre className="whitespace-pre-wrap text-red-600">{tagDebugInfo.error}</pre>
            ) : (
              <div>
                <div><strong>tag row:</strong> {tagDebugInfo.tagRow ? JSON.stringify(tagDebugInfo.tagRow) : 'not found'}</div>
                <div className="mt-2"><strong>relations count:</strong> {tagDebugInfo.relsCount}</div>
                <div className="mt-2"><strong>excluded ids (sample 50):</strong> {JSON.stringify((tagDebugInfo.excludedIds || []).slice(0,50))}</div>
                <div className="mt-2"><strong>auctionArticles ids (server RPC):</strong> {JSON.stringify((tagDebugInfo.auctionIds || []).slice(0,50))}</div>
              </div>
            )}
          </div>
        )}
      </div>
    );

  return <AuctionSliderNew articles={articles} />;
}
