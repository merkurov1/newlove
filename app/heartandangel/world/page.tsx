import React from 'react';
import type { Metadata } from 'next';
import WorldScene from '@/components/WorldScene';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, visualArtworkJsonLd } from '@/lib/structuredData';

export const metadata: Metadata = {
  title: 'World | Heart & Angel | Anton Merkurov',
  description:
    'Step into the eternal landscape where time flows, angels and demons coexist, and ambient music fills the air. World is part of the Heart & Angel mythology.',
  alternates: {
    canonical: 'https://www.merkurov.love/heartandangel/world',
  },
  openGraph: {
    title: 'World | Heart & Angel | Anton Merkurov',
    description:
      'Step into the eternal landscape where time flows, angels and demons coexist, and ambient music fills the air. World is part of the Heart & Angel mythology.',
    url: 'https://www.merkurov.love/heartandangel/world',
    siteName: 'Anton Merkurov',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png',
        width: 1200,
        height: 630,
        alt: 'World | Heart & Angel',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'World | Heart & Angel | Anton Merkurov',
    description:
      'Step into the eternal landscape where time flows, angels and demons coexist, and ambient music fills the air. World is part of the Heart & Angel mythology.',
    creator: '@merkurov',
    site: '@merkurov',
    images: [
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png',
    ],
  },
};

export default function WorldPage() {
  return (
    <div className="relative w-full min-h-screen bg-[#111] overflow-hidden">
      <JsonLd
        data={visualArtworkJsonLd({
          path: '/heartandangel/world',
          name: 'Heart & Angel — World',
          description:
            'An eternal digital landscape where time flows, angels and demons coexist, and ambient music fills the air.',
          image:
            'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png',
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Heart & Angel', path: '/heartandangel' },
          { name: 'World', path: '/heartandangel/world' },
        ])}
      />
      <WorldScene />
    </div>
  );
}