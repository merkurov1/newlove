export const dynamic = 'force-dynamic';

import React from 'react';
import Image from 'next/image';
import HeartAndAngelSection from '@/components/HeartAndAngelSection';

export const metadata = {
  title: 'Heart & Angel',
  description: 'Heart & Angel — a transmedia art project about choice, archetypes, and digital identity.'
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
      <main className="container mx-auto px-3 sm:px-4 py-12 sm:py-16 md:py-20">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 sm:mb-8 break-words leading-tight text-center">Heart & Angel</h1>
          <HeartAndAngelSection images={images} />

        </div>
      </main>
    </div>
  );
}
