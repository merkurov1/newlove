import React from 'react';
import type { Metadata } from 'next';
import HeartAndAngelHub from '@/components/HeartAndAngelHub';

export const metadata: Metadata = {
  title: 'Heart & Angel | Anton Merkurov',
  description: 'Heart & Angel is a living digital world of angels, devils, hearts, weather and small rituals of love, attention and release.',
  alternates: {
    canonical: 'https://www.merkurov.love/heartandangel',
  },
  openGraph: {
    title: 'Heart & Angel | Anton Merkurov',
    description: 'A living digital world of angels, devils, hearts, weather and small rituals of love, attention and release.',
    url: 'https://www.merkurov.love/heartandangel',
    siteName: 'Anton Merkurov',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png',
        width: 1200,
        height: 630,
        alt: 'Heart & Angel | Anton Merkurov',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Heart & Angel | Anton Merkurov',
    description: 'A living digital world of angels, devils, hearts, weather and small rituals of love, attention and release.',
    creator: '@merkurov',
    site: '@merkurov',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png'],
  },
};

export default function HeartAndAngelPage() {
  const projectJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: 'Heart & Angel',
    headline: 'A living digital world of love and attention',
    description: 'A living digital world of angels, devils, hearts, weather and small rituals of love, attention and release.',
    creator: { '@type': 'Person', name: 'Anton Merkurov' },
    url: 'https://www.merkurov.love/heartandangel',
    genre: 'Digital art',
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(projectJsonLd) }} />
      <HeartAndAngelHub />
    </>
  );
}
