// app/archive/page.tsx
import MediaArchive from '@/components/MediaArchive';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const metadata = sanitizeMetadata({
  title: 'Anton Merkurov — Media Archive',
  description: '129 indexed exhibits and publications by Anton Merkurov (2015–2026).',
  alternates: { canonical: 'https://www.merkurov.love/media' },
  openGraph: {
    title: 'Anton Merkurov — Media Archive',
    description: '129 indexed exhibits and publications by Anton Merkurov (2015–2026).',
    url: 'https://www.merkurov.love/media',
    siteName: 'Anton Merkurov',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Anton Merkurov — Media Archive',
    description: '129 indexed exhibits and publications by Anton Merkurov (2015–2026).',
  },
});

export default function ArchivePage() {
  return <MediaArchive />;
}
