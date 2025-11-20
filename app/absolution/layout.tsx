import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Digital Absolution | Anton Merkurov',
  description: 'Confess your digital sins and receive absolution. A conceptual art project exploring modern guilt, redemption, and our relationship with technology.',
  keywords: ['digital art', 'conceptual art', 'confession', 'absolution', 'interactive art', 'web art'],
  authors: [{ name: 'Anton Merkurov' }],
  openGraph: {
    title: 'Digital Absolution',
    description: 'Confess your digital sins and receive absolution. An interactive conceptual art experience.',
    url: 'https://merkurov.love/absolution',
    siteName: 'Anton Merkurov',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0947.png',
        width: 1200,
        height: 630,
        alt: 'Digital Absolution - Confess your digital sins',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Digital Absolution',
    description: 'Confess your digital sins and receive absolution.',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0947.png'],
    creator: '@merkurov',
  },
};

export default function AbsolutionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
