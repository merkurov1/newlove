import type { Metadata } from 'next';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import HeritageClient from '@/components/heritage/HeritageClient';

const siteUrl = 'https://www.merkurov.love';
const OG_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/artifacts/Heritage/TheThinker.jpg';

export const metadata: Metadata = sanitizeMetadata({
  title: 'Heritage Archive — Sergey & Anton Merkurov',
  description:
    'The documented legacy of monumental sculptor Sergey Merkurov and the cultural, archival, and Web3 initiatives of his great-grandson Anton Merkurov.',
  alternates: {
    canonical: `${siteUrl}/heritage`,
    languages: {
      'en-US': `${siteUrl}/heritage`,
      'ru-RU': `${siteUrl}/heritage`,
    },
  },
  openGraph: {
    title: 'Heritage Archive — Sergey & Anton Merkurov',
    description:
      'Family archives, the Gyumri house-museum, the Dynamo reliefs, historic death masks, and contemporary digital art.',
    url: `${siteUrl}/heritage`,
    siteName: 'Anton Merkurov',
    type: 'website',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 675,
        alt: 'Sergey Merkurov Heritage Archive — Thought sculpture',
      },
    ],
    locale: 'en_US',
    alternateLocale: ['ru_RU'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Heritage Archive — Sergey & Anton Merkurov',
    description:
      'The documented legacy of sculptor Sergey Merkurov and the cultural initiatives of Anton Merkurov.',
    images: [OG_IMAGE],
    creator: '@merkurov',
    site: '@merkurov',
  },
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${siteUrl}/heritage#webpage`,
      url: `${siteUrl}/heritage`,
      name: 'Heritage Archive — Sergey & Anton Merkurov',
      description:
        'The documented legacy of sculptor Sergey Merkurov and the cultural initiatives of Anton Merkurov across family archives, public monuments, museum history, print, and digital art.',
      inLanguage: ['en', 'ru'],
      isPartOf: {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: siteUrl,
        name: 'Anton Merkurov',
      },
      about: [
        {
          '@type': 'Person',
          name: 'Sergey Dmitrievich Merkurov',
          birthDate: '1881-11-07',
          deathDate: '1952-06-08',
          birthPlace: 'Alexandropol (Gyumri)',
          jobTitle: 'Monumental Sculptor, People’s Artist of the USSR',
          sameAs: 'https://en.wikipedia.org/wiki/Sergey_Merkurov',
        },
        {
          '@type': 'Person',
          name: 'Anton Merkurov',
          birthDate: '1981',
          jobTitle: 'Digital Strategist, Art Dealer & Heritage Architect',
          url: siteUrl,
        },
      ],
      author: {
        '@type': 'Person',
        name: 'Anton Merkurov',
        url: siteUrl,
      },
    },
  ],
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
