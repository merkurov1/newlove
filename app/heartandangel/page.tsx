export const dynamic = 'force-dynamic';

import React from 'react';
import HeartAndAngelSection from '@/components/HeartAndAngelSection';

export const metadata = {
  title: 'Heart & Angel | Merkurov.love',
  description: 'A universal mythology for a fragmented world.'
};

const images = [
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759212266765-IMG_0514.png',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759213959968-IMG_0517.png',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759231831822-IMG_0518.png',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759231854148-IMG_0519.jpeg',
];

export default function HeartAndAngelPage() {
  return (
    <div className="min-h-screen bg-white text-black selection:bg-black selection:text-white">
      <main className="container mx-auto px-4 py-12 md:py-20">
        <div className="flex flex-col items-center w-full">
          
          {/* Header Section */}
          <div className="text-center mb-12 max-w-2xl">
            <h1 className="font-serif text-4xl md:text-6xl mb-4 text-black tracking-tight">
              Heart & Angel
            </h1>
            <p className="font-mono text-xs md:text-sm text-neutral-500 uppercase tracking-widest">
              A universal mythology for a fragmented world
            </p>
          </div>

          {/* Gallery Component */}
          <HeartAndAngelSection images={images} />

        </div>
      </main>
    </div>
  );
}