import type { Metadata } from 'next';
import WorldScene from '@/components/WorldScene';

export const metadata: Metadata = {
  title: 'World of Heart & Angel — Digital Temple',
  description: 'A peaceful, breathing digital space with love, light, and gentle moments.',
  openGraph: {
    title: 'World of Heart & Angel — Digital Temple',
    description: 'A peaceful, breathing digital space with love, light, and gentle moments.',
    url: 'https://merkurov.love/heartandangel/world',
    siteName: 'Merkurov Love',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Heart1.png',
        width: 800,
        height: 800,
        alt: 'World of Heart & Angel',
      },
    ],
    locale: 'ru_RU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'World of Heart & Angel — Digital Temple',
    description: 'A peaceful, breathing digital space with love, light, and gentle moments.',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Heart1.png'],
  },
};

export default function WorldPage() {
  return (
    <div className="w-full min-h-screen bg-white overflow-x-hidden">
      <WorldScene />
    </div>
  );
}
