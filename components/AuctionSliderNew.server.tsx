import React from 'react';
import AuctionSliderNew from './AuctionSliderNew';

export default function AuctionSliderNewServer({ articles }: { articles?: any[] }) {
  if (!articles || articles.length === 0) return null;
  return <AuctionSliderNew articles={articles} />;
}
