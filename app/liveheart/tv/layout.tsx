import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'LiveHeart TV — Generative Heart Display',
  description:
    'A full-screen display mode for LiveHeart, the generative heart artwork by Anton Merkurov, designed for screens and installations.',
  path: '/liveheart/tv',
  languages: { 'x-default': '/liveheart/tv', en: '/liveheart/tv' },
});

export default function LiveHeartTvLayout({ children }: { children: React.ReactNode }) {
  return children;
}
