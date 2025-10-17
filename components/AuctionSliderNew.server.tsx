import React from 'react';
import AuctionSliderNew from './AuctionSliderNew';

export default function AuctionSliderNewServer({ articles }: { articles?: any[] }) {
  // If there are no articles, provide a safe placeholder so the UI
  // remains visible and consistent. This avoids returning null from
  // the server component which would hide the entire slot under Hero.
  if (!articles || articles.length === 0) {
    const placeholder = [{
      id: 'placeholder-auction',
      title: 'Пока нет аукционных статей',
      slug: '/',
      previewImage: null,
      description: 'Здесь будут показаны статьи с тегом "auction".'
    }];
    return <AuctionSliderNew articles={placeholder} />;
  }

  return <AuctionSliderNew articles={articles} />;
}
