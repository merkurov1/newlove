import type { Metadata } from 'next';
import LobbyClient from './LobbyClient';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata, ROUTE_COPY } from '@/lib/seo';
import { breadcrumbJsonLd, profilePageJsonLd } from '@/lib/structuredData';

const copy = ROUTE_COPY['/lobby'];

export const metadata: Metadata = pageMetadata({
  ...copy,
  path: '/lobby',
  type: 'profile',
  languages: {
    'x-default': '/lobby',
    en: '/lobby',
    ru: '/lobby',
  },
});

export default function LobbyPage() {
  return (
    <>
      <JsonLd
        data={profilePageJsonLd({
          path: '/lobby',
          name: 'Private Office & Access — Anton Merkurov',
          description: copy.description,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Private Office', path: '/lobby' },
        ])}
      />
      <LobbyClient />
    </>
  );
}
