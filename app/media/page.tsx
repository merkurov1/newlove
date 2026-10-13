// app/media/page.tsx
import type { Metadata } from 'next';
import { Suspense } from 'react';

// ⚠️ Поправьте пути под ваш проект: я не видел код глобального хедера и футера.
import Header from '@/components/Header';
import Footer from '@/components/Footer';

import MediaArchive from '@/components/media/MediaArchive';
import { records, archives } from '@/data/media';

const siteUrl = 'https://merkurov.love'; // Замените на ваш домен, если отличается

export const metadata: Metadata = {
  title: 'Media archive — Anton Merkurov',
  description:
    'Expert commentary, interviews and columns on the Russian internet, platforms, AI and the art market. Every record links to the original publication.',
  keywords: [
    'Anton Merkurov',
    'Антон Меркуров',
    'media archive',
    'expert commentary',
    'interviews',
    'columns',
    'internet censorship',
    'AI and tech',
    'art market',
    'Novaya Gazeta',
  ],
  authors: [{ name: 'Anton Merkurov', url: siteUrl }],
  creator: 'Anton Merkurov',
  publisher: 'Anton Merkurov',
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/media',
  },
  openGraph: {
    title: 'Media archive — Anton Merkurov',
    description: `${records.length} records from Le Monde, The New York Times, BBC, Deutsche Welle, Novaya Gazeta and more.`,
    url: '/media',
    siteName: 'Anton Merkurov',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/og-media.jpg', // Убедитесь, что файл превью есть в папке public
        width: 1200,
        height: 630,
        alt: 'Media archive — Anton Merkurov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Media archive — Anton Merkurov',
    description: `${records.length} records from Le Monde, The New York Times, BBC, Deutsche Welle, Novaya Gazeta and more.`,
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

export default function MediaPage() {
  return (
    <>
      <Header />
      <main id="main">
        {/* useSearchParams внутри MediaArchive требует Suspense при статическом рендере */}
        <Suspense fallback={null}>
          <MediaArchive records={records} archives={archives} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
