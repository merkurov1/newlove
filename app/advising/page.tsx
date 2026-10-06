import AdvisingClient from './AdvisingClient';

const OG_IMAGE = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Advising/IMG_1526.jpeg';

export const metadata = {
  alternates: { canonical: 'https://www.merkurov.love/advising' },
  title: 'Anton Merkurov — Advising & High-Stakes Counsel',
  description: 'Direct peer-to-peer counsel at the intersection of technology, culture, and capital for high-stakes environments.',
  openGraph: {
    title: 'Anton Merkurov — Advising & High-Stakes Counsel',
    description: 'Direct peer-to-peer counsel at the intersection of technology, culture, and capital for high-stakes environments.',
    url: 'https://www.merkurov.love/advising',
    siteName: 'Anton Merkurov',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Anton Merkurov',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Anton Merkurov — Advising & High-Stakes Counsel',
    description: 'Direct peer-to-peer counsel at the intersection of technology, culture, and capital for high-stakes environments.',
    images: [OG_IMAGE],
  },
};

export default function Page() {
  return <AdvisingClient />;
}
