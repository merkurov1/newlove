export const dynamic = 'force-dynamic';

import React from 'react';
import type { Metadata } from 'next';
import HeartAndAngelHub from '@/components/HeartAndAngelHub';

export const metadata: Metadata = {
  title: 'Heart & Angel | Anton Merkurov',
  description: 'A universal mythology for a fragmented world.',
  alternates: {
    canonical: 'https://www.merkurov.love/heartandangel',
  },
  openGraph: {
    title: 'Heart & Angel | Anton Merkurov',
    description: 'A universal mythology for a fragmented world.',
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
    description: 'A universal mythology for a fragmented world.',
    creator: '@merkurov',
    site: '@merkurov',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png'],
  },
};

export default function HeartAndAngelPage() {
  return <HeartAndAngelHub />;
}
