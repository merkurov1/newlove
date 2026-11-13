import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata, ROUTE_COPY } from '@/lib/seo';
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/structuredData';

const PATH = '/unframed/container';
const copy = ROUTE_COPY[PATH];

export const metadata: Metadata = pageMetadata({
  ...copy,
  path: PATH,
  type: 'article',
  authors: ['Anton Merkurov'],
  keywords: [
    'UNFRAMED',
    'Episode 42',
    'Step Out of the Physical Container',
    'cyber-noir',
    'digital awakening',
    'FidoNet',
    'Krovatka',
    'IRC',
    'digital identity',
    'Anton Merkurov',
  ],
  languages: {
    'x-default': PATH,
    en: PATH,
  },
});

export default function ContainerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={articleJsonLd({
          path: PATH,
          headline: 'UNFRAMED // Episode 42: Step Out of the Physical Container',
          description: copy.description,
          image: copy.image,
          authorName: 'Anton Merkurov',
          section: 'UNFRAMED',
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Anton Merkurov', path: '/' },
          { name: 'UNFRAMED', path: '/unframed' },
          { name: 'Episode 42: Step Out of the Physical Container', path: PATH },
        ])}
      />
      {children}
    </>
  );
}
