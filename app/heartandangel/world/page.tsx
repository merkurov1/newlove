export const dynamic = 'force-dynamic';

import React from 'react';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import WorldScene from '@/components/WorldScene';

export const metadata = sanitizeMetadata({
  title: 'World | Heart & Angel | Anton Merkurov',
  description: 'Step into the eternal landscape where time flows, angels and demons coexist, and ambient music fills the air.',
  alternates: {
    canonical: 'https://www.merkurov.love/heartandangel/world',
  },
  openGraph: {
    title: 'World | Heart & Angel | Anton Merkurov',
    description: 'Step into the eternal landscape where time flows, angels and demons coexist, and ambient music fills the air.',
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
    description: 'Step into the eternal landscape where time flows, angels and demons coexist, and ambient music fills the air.',
    creator: '@merkurov',
    site: '@merkurov',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png'],
  },
});

export default function WorldPage() {
  return (
    <div className="relative w-full min-h-screen bg-[#111] overflow-hidden">
      {/* Интерактивная сцена World (без отвлекающих элементов) */}
      <WorldScene />
    </div>
  );
}
