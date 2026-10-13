
import type { Metadata } from 'next';
import { Suspense } from 'react';

import MediaArchive from '@/components/media/MediaArchive';
import { records, archives } from '@/data/media';

const siteUrl = 'https://www.merkurov.love';

const archiveDescription =
  'A chronological archive of interviews, expert commentary, author columns and media citations featuring Anton Merkurov. Each entry links to its original publication.';

export const metadata: Metadata = {
  title: 'Media Archive — Anton Merkurov',
  description: archiveDescription,

  keywords: [
    'Anton Merkurov',
    'Антон Меркуров',
    'media archive',
    'expert commentary',
    'interviews',
    'author columns',
    'internet censorship',
    'AI and technology',
    'art market',
    'Novaya Gazeta',
  ],

  authors: [
    {
      name: 'Anton Merkurov',
      url: siteUrl,
    },
  ],

  creator: 'Anton Merkurov',
  publisher: 'Anton Merkurov',

  alternates: {
    canonical: '/media',
  },

  openGraph: {
    title: 'Media Archive — Anton Merkurov',
    description: `${records.length} media records featuring Anton Merkurov.`,
    url: `${siteUrl}/media`,
    siteName: 'Anton Merkurov',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/og-media.jpg',
        width: 1200,
        height: 630,
        alt: 'Media Archive — Anton Merkurov',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Media Archive — Anton Merkurov',
    description: `${records.length} media records featuring Anton Merkurov.`,
    images: ['/og-media.jpg'],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

function MediaArchiveFallback() {
  return (
    <div
      aria-label="Loading media archive"
      style={{
        minHeight: '50vh',
        padding: '64px 24px',
        color: '#77766f',
        fontSize: '12px',
      }}
    >
      Loading media archive…
    </div>
  );
}

export default function MediaPage() {
  return (
    <Suspense fallback={<MediaArchiveFallback />}>
      <MediaArchive records={records} archives={archives} />
    </Suspense>
  );
}
