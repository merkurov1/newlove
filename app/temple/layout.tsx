import type { Metadata } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import { TEMPLE_HOME_ASSETS } from '@/lib/temple/homeAssets';

const templeSerif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant-temple',
  display: 'swap',
});

const templeSans = Inter({
  subsets: ['latin'],
  variable: '--font-inter-temple',
  display: 'swap',
});

const TEMPLE_URL = 'https://www.merkurov.love/temple';

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

    description: 'A quiet digital temple of presence, ritual, and traces.',

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

    description: 'A quiet digital temple of presence, ritual, and traces.',

    images: [TEMPLE_IMAGE],
  },

  robots: {
    index: true,
    follow: true,
  },
};

export default function TempleLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${templeSerif.variable} ${templeSans.variable}`}>{children}</div>;
}
