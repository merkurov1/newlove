import React from 'react';
import AuctionSlider from './AuctionSlider';

/**
 * Server wrapper for the client `AuctionSlider` component.
 * Accepts pre-fetched `articles` (normalized from tagHelpers) and
 * renders the client slider only when there are articles to show.
 */
export default function AuctionSliderServer({ articles }: { articles?: any[] }) {
  if (!articles || articles.length === 0) return null;

  // Pass through to the client component. Articles are expected to be
  // normalized (id, title, slug, previewImage, description, ...).
  return <AuctionSlider articles={articles} />;
}
