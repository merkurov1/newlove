import { Suspense } from 'react';
import LetItGoAngel from '@/components/LetItGoAngel';
import TempleWrapper from '@/components/TempleWrapper';
import TempleEntry from '@/components/TempleEntry.client';
import './letitgo.css';

export const metadata = {
  title: 'Let the Heart Go | Merkurov',
  description: 'Interactive Digital Art. The Angel releases the burden.',
  openGraph: {
    title: 'Let the Heart Go',
    description: 'Interactive Digital Art. The Angel releases the burden.',
    url: 'https://merkurov.love/heartandangel/letitgo',
    type: 'website',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png',
        width: 1200,
        height: 1200,
        alt: 'Angel lets the heart go',
      },
    ],
  },
};

export default function LetItGoPage() {
  return (
    <div className="fixed inset-0 w-full h-[100dvh] overflow-hidden select-none bg-[#F6F4F0]">
      <TempleEntry />
      
      {/* Обертка режима Храма */}
      <Suspense fallback={null}>
        <TempleWrapper />
      </Suspense>

      {/* Интерактивный компонент ангела во весь экран */}
      <div className="absolute inset-0 w-full h-full flex items-center justify-center">
        <LetItGoAngel />
      </div>
    </div>
  );
}
