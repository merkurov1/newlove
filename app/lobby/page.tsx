import type { Metadata } from 'next';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import LobbyClient from './LobbyClient';

const OG_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png';

export const metadata: Metadata = sanitizeMetadata({
  title: 'Private Office & Access | Anton Merkurov',
  description: 'Heritage Architecture for the Post-Digital Age.',
  alternates: {
    canonical: 'https://www.merkurov.love/lobby',
  },
  openGraph: {
    title: 'Private Office & Access | Anton Merkurov',
    description: 'Heritage Architecture for the Post-Digital Age.',
    url: 'https://www.merkurov.love/lobby',
    siteName: 'Anton Merkurov',
    type: 'website',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Anton Merkurov — Private Office & Access',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Private Office & Access | Anton Merkurov',
    description: 'Heritage Architecture for the Post-Digital Age.',
    images: [OG_IMAGE],
    creator: '@merkurov',
    site: '@merkurov',
  },
});

export default function LobbyPage() {
  return <LobbyClient />;
}
