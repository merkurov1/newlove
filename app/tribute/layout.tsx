import type { Metadata } from 'next';

const TRIBUTE_URL =
  'https://www.merkurov.love/tribute';

const TRIBUTE_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png';

export const metadata: Metadata = {
  title: 'Tribute — Digital Temple',

  description:
    'Offer light to the Sanctuary. Tribute is a digital ritual of love, energy and generosity.',

  alternates: {
    canonical: TRIBUTE_URL,
  },

  openGraph: {
    title: 'Tribute — Digital Temple',

    description:
      'Offer light to the Sanctuary. A digital ritual of love, energy and generosity.',

    url: TRIBUTE_URL,

    siteName: 'Merkurov Love',

    images: [
      {
        url: TRIBUTE_IMAGE,
        width: 800,
        height: 800,
        alt: 'Tribute — Heart & Angel',
      },
    ],

    locale: 'en_US',

    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',

    title: 'Tribute — Digital Temple',

    description:
      'Offer light to the Sanctuary. A digital ritual of love, energy and generosity.',

    images: [TRIBUTE_IMAGE],
  },

  robots: {
    index: true,
    follow: true,
  },
};

export default function TributeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}