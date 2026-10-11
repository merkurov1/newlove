import type { Metadata } from 'next';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

const image =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg';
const title = 'UNFRAMED - Memoir by Anton Merkurov';
const description = 'UNFRAMED — a memoir by Anton Merkurov. The transition from Granite to Ether.';
const url = 'https://www.merkurov.love/unframed';

export const metadata: Metadata = sanitizeMetadata({
  title,
  description,
  alternates: { canonical: url },
  authors: [{ name: 'Anton Merkurov', url: 'https://www.merkurov.love' }],
  openGraph: {
    type: 'article',
    locale: 'en_US',
    title,
    description,
    url,
    siteName: 'Anton Merkurov',
    images: [
      {
        url: image,
        width: 1200,
        height: 630,
        alt: 'UNFRAMED — cover artwork',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@merkurov',
    title,
    description,
    images: [image],
  },
});

const unframedJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Book',
  name: 'UNFRAMED',
  author: {
    '@type': 'Person',
    name: 'Anton Merkurov',
    url: 'https://www.merkurov.love',
  },
  publisher: {
    '@type': 'Person',
    name: 'Anton Merkurov',
    url: 'https://www.merkurov.love',
  },
  description,
  image: [image],
  url,
};

export default function UnframedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(unframedJsonLd) }}
      />
      {children}
    </>
  );
}
