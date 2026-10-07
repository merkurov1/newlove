import type { Metadata } from 'next';
import HeartAndAngelHub from '@/components/HeartAndAngelHub';

export const metadata: Metadata = {
  title: 'Heart & Angel | Anton Merkurov',
  description:
    'Heart & Angel is an ongoing multidisciplinary art project exploring the Angel, the Devil and the heart through painting, digital graphics, augmented reality and code.',
  alternates: {
    canonical: 'https://www.merkurov.love/heartandangel',
  },
  openGraph: {
    title: 'Heart & Angel | Anton Merkurov',
    description:
      'Heart & Angel is an ongoing multidisciplinary art project exploring the Angel, the Devil and the heart through painting, digital graphics, augmented reality and code.',
    url: 'https://www.merkurov.love/heartandangel',
    siteName: 'Anton Merkurov',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png',
        width: 1200,
        height: 630,
        alt: 'Heart & Angel',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Heart & Angel | Anton Merkurov',
    description:
      'Heart & Angel is an ongoing multidisciplinary art project exploring the Angel, the Devil and the heart through painting, digital graphics, augmented reality and code.',
    creator: '@merkurov',
    site: '@merkurov',
    images: [
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png',
    ],
  },
};

export default function HeartAndAngelPage() {
  return <HeartAndAngelHub />;
}