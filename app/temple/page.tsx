import type { Metadata } from 'next';
import TempleClient from './TempleClient';

export const metadata: Metadata = {
  title: 'Digital Temple',
  description: 'A real place on the internet where rituals work and every visitor leaves a trace.',
  openGraph: {
    title: 'Digital Temple',
    description: 'A real place on the internet where rituals work and every visitor leaves a trace.',
    url: 'https://merkurov.love/temple',
    siteName: 'Merkurov',
    images: [
      {
        url: '/og-temple.jpg',
        width: 1200,
        height: 630,
        alt: 'Digital Temple',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Digital Temple',
    description: 'A real place on the internet where rituals work and every visitor leaves a trace.',
    images: ['/og-temple.jpg'],
  },
};

export default function TemplePage() {
  return <TempleClient />;
}
