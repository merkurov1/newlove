export const dynamic = 'force-dynamic';

import React from 'react';
import HeartAndAngelSection from '@/components/HeartAndAngelSection';
import CenteredHeader from '@/components/CenteredHeader';

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
    <main className="min-h-screen bg-[#FDFBF7] text-[#111] font-sans selection:bg-black selection:text-white">

      {/* DECORATIVE BORDER TOP */}
      <div className="h-1 w-full bg-black fixed top-0 z-50"></div>

      <div className="max-w-3xl mx-auto px-6 py-20 md:py-32">
        <div className="flex flex-col items-center w-full">

          <CenteredHeader
            eyebrow={<>Visual Mythology</>}
            title={<>Heart &amp; Angel</>}
            subtitle={<>A universal mythology for a fragmented world.</>}
          />

          {/* Gallery Component */}
          <div className="w-full">
            <HeartAndAngelSection images={images} />
          </div>

        </div>
      </div>
    </main>
  );
}