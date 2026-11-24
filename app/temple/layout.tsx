import type { Metadata } from 'next';
import { TEMPLE_HOME_ASSETS } from '@/lib/temple/homeAssets';

const TEMPLE_URL =
  'https://www.merkurov.love/temple';

const TEMPLE_IMAGE = TEMPLE_HOME_ASSETS.left;

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
        width: 896,
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