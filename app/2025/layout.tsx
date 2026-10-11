import type { Metadata } from 'next';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const metadata: Metadata = sanitizeMetadata({
  title: '2025 — Merkurov',
  description: 'Year review 2025 — inventory, generative artifacts, and analytical reports by Anton Merkurov.',
  alternates: {
    canonical: 'https://www.merkurov.love/2025',
  },
  openGraph: {
    title: '2025 — Merkurov',
    description: 'Year review 2025 — inventory, generative artifacts, and analytical reports by Anton Merkurov.',
    url: 'https://www.merkurov.love/2025',
    siteName: 'Anton Merkurov',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '2025 — Merkurov',
    description: 'Year review 2025 — inventory, generative artifacts, and analytical reports.',
  },
});

export default function Layout2025({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
