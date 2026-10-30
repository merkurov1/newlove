import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, collectionPageJsonLd } from '@/lib/structuredData';

const DESCRIPTION =
  'An index of every public project by Anton Merkurov: art, heritage, advising, publishing, research, digital rituals and experimental tools.';

export const metadata: Metadata = pageMetadata({
  title: 'All Projects — Index | Anton Merkurov',
  description: DESCRIPTION,
  path: '/all',
  languages: { 'x-default': '/all', en: '/all' },
});

export default function AllLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={collectionPageJsonLd({
          path: '/all',
          name: 'All projects — Anton Merkurov',
          description: DESCRIPTION,
          items: [
            { name: 'Heritage Archive', url: '/heritage' },
            { name: 'Media Archive', url: '/media' },
            { name: 'UNFRAMED', url: '/unframed' },
            { name: 'Flow', url: '/flow' },
            { name: 'Selection', url: '/selection' },
          ],
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'All Projects', path: '/all' },
        ])}
      />
      {children}
    </>
  );
}
