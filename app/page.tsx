import type { Metadata } from 'next';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import HomeClient from '@/components/HomeClient';

export const metadata: Metadata = sanitizeMetadata({
  title: 'Anton Merkurov | Art x Love x Money',
  description:
    'Digital Strategist, Art Dealer, and Heritage Architect. The intersection of High-Tech and Old Money.',
  alternates: {
    canonical: 'https://www.merkurov.love',
  },
  openGraph: {
    title: 'Anton Merkurov | Art x Love x Money',
    description:
      'Digital Strategist, Art Dealer, and Heritage Architect. The intersection of High-Tech and Old Money.',
    url: 'https://www.merkurov.love',
    siteName: 'Anton Merkurov',
    type: 'website',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Anton Merkurov - Context Architecture & Cultural Capital',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Anton Merkurov | Art x Love x Money',
    description: 'Digital Strategist, Art Dealer, and Heritage Architect.',
    images: [
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png',
    ],
  },
});

export default function Home() {
  return <HomeClient />;
}
