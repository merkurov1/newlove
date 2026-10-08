// app/archive/page.tsx
import MediaArchive from '@/components/MediaArchive';

export const metadata = {
  title: 'Anton Merkurov — Media Archive',
  description: '129 indexed exhibits and publications by Anton Merkurov (2015–2026).',
};

export default function ArchivePage() {
  return <MediaArchive />;
}
