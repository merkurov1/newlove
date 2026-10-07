import type { Metadata } from 'next';
import CastClient from './CastClient';

export const metadata: Metadata = {
  title: 'Cast — Psychological Protocol | Digital Temple',
  description:
    'A psychological protocol of the Digital Temple. Ten questions, an Agency Index, and a perceptual archetype.',
  alternates: {
    canonical: 'https://www.merkurov.love/cast',
  },
  openGraph: {
    title: 'Cast — Psychological Protocol | Digital Temple',
    description:
      'Ten questions. An Agency Index. A perceptual archetype.',
    url: 'https://www.merkurov.love/cast',
    siteName: 'Merkurov Love',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png',
        width: 1024,
        height: 1024,
        alt: 'Cast — Digital Temple',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cast — Psychological Protocol | Digital Temple',
    description:
      'Ten questions. An Agency Index. A perceptual archetype.',
    images: [
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png',
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export default function CastPage() {
  return <CastClient />;
}