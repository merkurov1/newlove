import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata, ROUTE_COPY } from '@/lib/seo';
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/structuredData';

const PATH = '/unframed/spectral-tiger';
const copy = ROUTE_COPY[PATH];

export const metadata: Metadata = pageMetadata({
  ...copy,
  path: PATH,
  type: 'article',
  authors: ['Anton Merkurov'],
  keywords: [
    'UNFRAMED',
    'Spectral Tiger',
    'World of Warcraft',
    'digital scarcity',
    'virtual sovereignty',
    'Anton Merkurov',
    'documentary series',
  ],
  languages: {
    'x-default': PATH,
    en: PATH,
  },
});

export default function SpectralTigerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={articleJsonLd({
          path: PATH,
          headline: 'UNFRAMED // Episode 0: The Spectral Tiger',
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
          { name: 'Episode 0: The Spectral Tiger', path: PATH },
        ])}
      />
      {children}
    </>
  );
}
