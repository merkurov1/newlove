export const dynamic = 'force-dynamic';

import React from 'react';
import Image from 'next/image';
import HeartAndAngelSection from '@/components/HeartAndAngelSection';

export const metadata = {
  title: '#HEARTANDANGEL',
  description: 'Heart & Angel — трансмедийный художественный проект о выборе, архетипах и цифровой идентичности.'
};

const images = [
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759212266765-IMG_0514.png',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759213959968-IMG_0517.png',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759231831822-IMG_0518.png',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759231854148-IMG_0519.jpeg',
];

export default function HeartAndAngelPage() {
  return (
    <div className="min-h-screen bg-white">
      <main className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold mb-6 break-words leading-tight">#HEARTANDANGEL</h1>
          <HeartAndAngelSection images={images} />

        </div>
      </main>
    </div>
  );
}
