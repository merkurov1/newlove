import type { Metadata } from 'next';
import NovayaGazetaClient from './NovayaGazetaClient'; // или ваш клиентский код

export const metadata: Metadata = {
  title: 'From Content Censorship to Hardware Hegemony — Merkurov.Report',
  description: 'Analytical report (2025) by Anton Merkurov on the transformation of digital control in Russia — from content censorship to device and infrastructure control. Insightful forecasts and practical analysis for journalists and researchers.',
  alternates: {
    canonical: 'https://www.merkurov.love/research/novayagazeta2025',
  },
  openGraph: {
    title: 'From Content Censorship to Hardware Hegemony — Merkurov.Report',
    description: 'Analytical report (2025) by Anton Merkurov on the transformation of digital control in Russia.',
    url: 'https://www.merkurov.love/research/novayagazeta2025',
    siteName: 'Anton Merkurov',
    type: 'article',
    images: [
      {
        url: 'https://www.merkurov.love/images/og/novayagazeta2025.png',
        width: 1200,
        height: 630,
        alt: 'Cover image for NovayaGazeta 2025 report',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'From Content Censorship to Hardware Hegemony — Merkurov.Report',
    description: 'Analytical report (2025) by Anton Merkurov on the transformation of digital control in Russia.',
    creator: '@merkurov',
    site: '@merkurov',
  },
};

export default function Page() {
  return <NovayaGazetaClient />;
}
