import type { Metadata } from 'next';
import CardPageClient from './CardPageClient';

const SITE_URL = 'https://merkurov.love';
const PAGE_PATH = '/heartandangel/card';
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;

const TITLE = 'Send a Heart & Angel postcard';
const DESCRIPTION =
  'An original Heart & Angel artwork as a physical postcard. Add a personal message and we post it to someone you care about. £29, postage included.';

const SHARE_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/artifacts/Postcard/IMG_1508.jpeg';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    siteName: 'Heart & Angel',
    title: `${TITLE} — an original artwork, posted for you`,
    description: DESCRIPTION,
    locale: 'en_GB',
    images: [{ url: SHARE_IMAGE, alt: 'A physical Heart & Angel postcard' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [SHARE_IMAGE],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Heart & Angel postcard',
  description: DESCRIPTION,
  image: [SHARE_IMAGE],
  url: PAGE_URL,
  brand: { '@type': 'Brand', name: 'Heart & Angel' },
  creator: { '@type': 'Person', name: 'Anton Merkurov' },
  offers: {
    '@type': 'Offer',
    url: PAGE_URL,
    price: '29.00',
    priceCurrency: 'GBP',
    availability: 'https://schema.org/InStock',
  },
};

export default function HeartAndAngelCardRoute() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <CardPageClient />
    </>
  );
}
