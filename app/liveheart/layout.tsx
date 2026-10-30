import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'LiveHeart — Imprint Your Chaos | Anton Merkurov',
  description:
    'Create and share generative heart artifacts. Interact with the LiveHeart engine to generate a unique digital heart and save it to your collection.',
  path: '/liveheart',
  languages: { 'x-default': '/liveheart', en: '/liveheart' },
});

export default function LiveHeartLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
