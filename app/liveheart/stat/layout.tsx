import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'LiveHeart Statistics — Artifact Patterns',
  description:
    'Aggregate statistics for LiveHeart artifacts: palettes, structures, physics and shared patterns from the generative heart experiment.',
  path: '/liveheart/stat',
  languages: { 'x-default': '/liveheart/stat', en: '/liveheart/stat' },
});

export default function LiveHeartStatsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
