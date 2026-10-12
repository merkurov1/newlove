// app/media/page.tsx
import type { Metadata } from 'next';
import { Suspense } from 'react';

// ⚠️ Поправьте пути под ваш проект: я не видел код глобального хедера и футера.
import Header from '@/components/Header';
import Footer from '@/components/Footer';

import MediaArchive from '@/components/media/MediaArchive';
import { records, archives } from '@/data/media';

export const metadata: Metadata = {
  title: 'Media archive — Anton Merkurov',
  description:
    'Expert commentary, interviews and columns on the Russian internet, platforms, AI and the art market. Every record links to the original publication.',
  alternates: { canonical: '/media' },
  openGraph: {
    title: 'Media archive — Anton Merkurov',
    description: `${records.length} records from Le Monde, The New York Times, BBC, Deutsche Welle, Novaya Gazeta and more.`,
    url: '/media',
    type: 'website',
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
