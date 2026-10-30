import type { Metadata } from 'next';
import MediaArchive from '@/components/media/MediaArchive';
import { archives } from '@/data/media';
import { getMediaRecords } from '@/lib/mediaRecords';

import { ROUTE_COPY, pageMetadata } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, collectionPageJsonLd } from '@/lib/structuredData';

export const dynamic = 'force-dynamic';
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
    ru: '/media',
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
      <MediaArchive records={records} archives={archives} />
    </>
  );
}