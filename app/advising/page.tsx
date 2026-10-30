import type { Metadata } from 'next';
import AdvisingClient from './AdvisingClient';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata, ROUTE_COPY } from '@/lib/seo';
import { breadcrumbJsonLd, professionalServiceJsonLd } from '@/lib/structuredData';

const copy = ROUTE_COPY['/advising'];

export const metadata: Metadata = pageMetadata({
  ...copy,
  path: '/advising',
  type: 'website',
  languages: {
    'x-default': '/advising',
    en: '/advising',
    ru: '/advising',
  },
});

export default function Page() {
  return (
    <>
      <JsonLd
        data={professionalServiceJsonLd({
          path: '/advising',
          name: 'Anton Merkurov — Advising & High-Stakes Counsel',
          description: copy.description,
          serviceType: [
            'Digital strategy',
            'Art market advisory',
            'Heritage and archive strategy',
            'Cultural communications',
          ],
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Advising', path: '/advising' },
        ])}
      />
      <AdvisingClient />
    </>
  );
}
