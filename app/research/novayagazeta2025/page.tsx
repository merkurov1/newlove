import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata } from '@/lib/seo';
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/structuredData';
import NovayaGazetaClient from './NovayaGazetaClient'; // или ваш клиентский код

const REPORT_DESCRIPTION =
  'Analytical report (2025) by Anton Merkurov on the shift from content censorship to device and infrastructure control in Russia, with forecasts and practical analysis.';

export const metadata: Metadata = pageMetadata({
  title: 'From Content Censorship to Hardware Hegemony',
  description: REPORT_DESCRIPTION,
  path: '/research/novayagazeta2025',
  type: 'article',
  authors: ['Anton Merkurov'],
  languages: {
    'x-default': '/research/novayagazeta2025',
    en: '/research/novayagazeta2025',
    ru: '/research/novayagazeta2025',
  },
});

export default function Page() {
  return (
    <>
      <JsonLd
        data={articleJsonLd({
          path: '/research/novayagazeta2025',
          headline: 'From Content Censorship to Hardware Hegemony',
          description: REPORT_DESCRIPTION,
          section: 'Research',
          authorName: 'Anton Merkurov',
          inLanguage: 'en',
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Research', path: '/research' },
          { name: 'From Content Censorship to Hardware Hegemony', path: '/research/novayagazeta2025' },
        ])}
      />
      <NovayaGazetaClient />
    </>
  );
}
