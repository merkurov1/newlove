import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, creativeWorkJsonLd } from '@/lib/structuredData';

const DESCRIPTION =
  'A visual lecture on the history of communication — from smoke signals and the telegraph to the internet, platforms and algorithmic media.';

export const metadata: Metadata = pageMetadata({
  title: 'History of Communication — Visual Lecture',
  description: DESCRIPTION,
  path: '/communications',
  languages: { 'x-default': '/communications', en: '/communications' },
});

export default function CommunicationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={creativeWorkJsonLd({
          path: '/communications',
          name: 'History of Communication — visual lecture',
          description: DESCRIPTION,
          genre: 'Lecture',
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'History of Communication', path: '/communications' },
        ])}
      />
      {children}
    </>
  );
}
