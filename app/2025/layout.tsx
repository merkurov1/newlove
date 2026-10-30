import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

const DESCRIPTION =
  'Year review 2025: the inventory of generative artifacts, research reports, artworks and analytical projects by Anton Merkurov.';

export const metadata: Metadata = pageMetadata({
  title: '2025 — Year Review | Anton Merkurov',
  description: DESCRIPTION,
  path: '/2025',
  languages: { 'x-default': '/2025', en: '/2025', ru: '/2025' },
});

export default function Layout2025({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
