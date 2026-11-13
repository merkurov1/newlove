import type { Metadata } from 'next';
import { Suspense } from 'react';
import MediaArchive from '@/components/media/MediaArchive';
import { archives } from '@/data/media';
import { getMediaRecords } from '@/lib/mediaRecords';

import { ROUTE_COPY, pageMetadata } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, collectionPageJsonLd } from '@/lib/structuredData';

export const revalidate = 300;
export const runtime = 'nodejs';

const copy = ROUTE_COPY['/media'];

export const metadata: Metadata = pageMetadata({
  ...copy,
  path: '/media',
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
  languages: {
    'x-default': '/media',
    en: '/media',
  },
});

export default async function MediaPage() {
  const records = await getMediaRecords();

  return (
    <>
      <JsonLd
        data={collectionPageJsonLd({
          path: '/media',
          name: 'Media Archive — Anton Merkurov',
          description: copy.description,
          items: records.slice(0, 200).map((record) => ({
            name: record.title,
            url: `/media/record/${encodeURIComponent(record.slug)}`,
          })),
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Media Archive', path: '/media' },
        ])}
      />
      <Suspense
        fallback={
          <div className="mx-auto max-w-6xl px-6 py-24 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            Loading media archive…
          </div>
        }
      >
        <MediaArchive records={records} archives={archives} />
      </Suspense>
    </>
  );
}
