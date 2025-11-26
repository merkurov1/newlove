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
    <div className="min-h-screen bg-[#FDFBF7] text-[#111] selection:bg-black selection:text-white">
      {/* DECORATIVE BORDER TOP */}
      <div className="h-1 w-full bg-black fixed top-0 z-50"></div>

      <main className="container mx-auto px-4 py-20 md:py-32">
        <div className="flex flex-col items-center w-full">
          
          {/* Header Section */}
          <div className="text-center mb-16 border-b border-gray-200 pb-8 w-full max-w-2xl">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-gray-400 block mb-6">
              Visual Mythology
            </span>
            <h1 className="font-serif text-5xl md:text-7xl mb-6 text-black tracking-tight leading-none">
              Heart & Angel
            </h1>
            <p className="font-serif italic text-xl text-gray-600">
              A universal mythology for a fragmented world.
            </p>
          </div>

          {/* Gallery Component */}
          <div className="w-full">
            <HeartAndAngelSection images={images} />
          </div>

        </div>
      </main>
    </div>
  );
}