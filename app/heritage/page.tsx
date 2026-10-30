import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata, ROUTE_COPY } from '@/lib/seo';
import {
  breadcrumbJsonLd,
  collectionPageJsonLd,
  personHeritageJsonLd,
} from '@/lib/structuredData';
import HeritageClient from '@/components/heritage/HeritageClient';

const copy = ROUTE_COPY['/heritage'];

export const metadata: Metadata = pageMetadata({
  ...copy,
  path: '/heritage',
  imageWidth: 1200,
  imageHeight: 675,
  languages: {
    'x-default': '/heritage',
    en: '/heritage',
    ru: '/heritage',
  },
});

export default function Page() {
  return (
    <>
      <JsonLd data={personHeritageJsonLd()} />
      <JsonLd
        data={collectionPageJsonLd({
          path: '/heritage',
          name: 'Heritage Archive — Sergey & Anton Merkurov',
          description: copy.description,
          items: [
            { name: 'Sergey Merkurov — biography and monuments', url: '/heritage' },
            { name: 'The Gyumri house-museum', url: '/heritage' },
            { name: 'Dynamo Stadium reliefs', url: '/heritage' },
            { name: 'Death masks and the Lenin mausoleum', url: '/heritage' },
          ],
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Heritage Archive', path: '/heritage' },
        ])}
      />
      <HeritageClient />
    </>
  );
}
