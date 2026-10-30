import type { Metadata } from 'next';
import HomeClient from '@/components/HomeClient';
import { HomeIntro } from '@/components/home/HomeIntro';
import { pageMetadata, ROUTE_COPY } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, profilePageJsonLd } from '@/lib/structuredData';

const copy = ROUTE_COPY['/'];

export const metadata: Metadata = pageMetadata({
  ...copy,
  path: '/',
  languages: {
    'x-default': '/',
    en: '/',
    ru: '/',
  },
});

export default function Home() {
  return (
    <>
      <JsonLd
        data={profilePageJsonLd({
          path: '/',
          name: 'Anton Merkurov — official website and archive',
          description: copy.description,
        })}
      />
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }])} />
      <HomeClient />
      <HomeIntro />
    </>
  );
}
