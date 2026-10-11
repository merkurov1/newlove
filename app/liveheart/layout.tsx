import type { Metadata } from 'next';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const metadata: Metadata = sanitizeMetadata({
  title: 'LiveHeart — Imprint Your Chaos',
  description: 'Create and share generative heart artifacts. Interact to generate a unique LiveHeart and save it to share.',
  alternates: {
    canonical: 'https://www.merkurov.love/liveheart',
  },
  openGraph: {
    title: 'LiveHeart — Imprint Your Chaos',
    description: 'Create and share generative heart artifacts. Interact to generate a unique LiveHeart and save it to share.',
    url: 'https://www.merkurov.love/liveheart',
    siteName: 'Anton Merkurov',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LiveHeart — Imprint Your Chaos',
    description: 'Create and share generative heart artifacts.',
  },
});

export default function LiveHeartLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
