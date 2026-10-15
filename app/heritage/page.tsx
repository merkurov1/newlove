import type { Metadata } from 'next';
import { HeritageClient } from './heritage-client';

const siteUrl = 'https://www.merkurov.love';

export const metadata: Metadata = {
  title: 'Heritage Archive',
  description:
    'The documented legacy of Sergey Merkurov and the archival, cultural and digital projects of his great-grandson Anton Merkurov.',
  alternates: { canonical: '/heritage' },
  openGraph: {
    title: 'Heritage Archive — Anton Merkurov',
    description:
      'Family history, the house museum in Gyumri, the Dynamo reliefs, death masks and digital art.',
    url: `${siteUrl}/heritage`,
    siteName: 'Anton Merkurov',
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['ru_RU'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Heritage Archive — Anton Merkurov',
  url: `${siteUrl}/heritage`,
  inLanguage: ['en', 'ru'],
  about: {
    '@type': 'Person',
    name: 'Sergey Merkurov',
    birthDate: '1881-11-07',
    birthPlace: 'Alexandropol (Gyumri)',
    jobTitle: 'Sculptor',
  },
  author: { '@type': 'Person', name: 'Anton Merkurov', url: siteUrl },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HeritageClient />
    </>
  );
}
