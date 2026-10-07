import type { Metadata } from 'next';

const TEMPLE_URL =
  'https://www.merkurov.love/temple';

const TEMPLE_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png';

export const metadata: Metadata = {
  title: 'The Sanctuary — Digital Temple',

  description:
    'A quiet digital temple of presence, ritual, and traces. Enter the Sanctuary and leave a trace.',

  alternates: {
    canonical: TEMPLE_URL,
  },

  openGraph: {
    title: 'The Sanctuary — Digital Temple',

    description:
      'A quiet digital temple of presence, ritual, and traces.',

    url: TEMPLE_URL,

    siteName: 'Merkurov Love',

    images: [
      {
        url: TEMPLE_IMAGE,
        width: 1200,
        height: 1200,
        alt: 'The Sanctuary — Heart & Angel',
      },
    ],

    locale: 'en_US',

    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',

    title: 'The Sanctuary — Digital Temple',

    description:
      'A quiet digital temple of presence, ritual, and traces.',

    images: [TEMPLE_IMAGE],
  },

  robots: {
    index: true,
    follow: true,
  },
};

export default function TempleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}