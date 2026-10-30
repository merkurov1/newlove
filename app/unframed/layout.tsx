import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { DEFAULT_OG_IMAGE, pageMetadata, ROUTE_COPY } from '@/lib/seo';
import { bookJsonLd } from '@/lib/structuredData';

const copy = ROUTE_COPY['/unframed'];

// TODO(anton): add the official Substack URL (and any other store page) when confirmed.
const EBOOK_LINKS = [
  'https://books.apple.com/gb/book/unframed/id6792809614',
  'https://www.barnesandnoble.com/w/unframed-anton-merkurov/1150840054?ean=2940196903984',
];

export const metadata: Metadata = pageMetadata({
  ...copy,
  path: '/unframed',
  type: 'book',
  image: copy.image || DEFAULT_OG_IMAGE,
  imageAlt: copy.imageAlt,
  authors: ['Anton Merkurov'],
  languages: {
    'x-default': '/unframed',
    en: '/unframed',
  },
});

export default function UnframedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={bookJsonLd({
          path: '/unframed',
          name: 'UNFRAMED',
          description: copy.description,
          image: copy.image,
          sameAs: EBOOK_LINKS,
        })}
      />
      {children}
    </>
  );
}
