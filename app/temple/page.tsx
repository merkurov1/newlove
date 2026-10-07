// app/temple/page.tsx

import type { Metadata } from 'next';
import TempleClient from './TempleClient';

const TEMPLE_URL = 'https://www.merkurov.love/temple';

const TEMPLE_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png';

export const metadata: Metadata = {
  title: 'The Sanctuary — Digital Temple | Merkurov Love',

  description:
    'A living digital sanctuary of presence, ritual and traces. Enter the Digital Temple by Merkurov Love.',

  keywords: [
    'Digital Temple',
    'The Sanctuary',
    'Heart & Angel',
    'Merkurov Love',
    'digital ritual',
    'online sanctuary',
    'digital art',
    'Anton Merkurov',
  ],

  authors: [
    {
      name: 'Anton Merkurov',
      url: 'https://www.merkurov.love',
    },
  ],

  creator: 'Anton Merkurov',
  publisher: 'Merkurov Love',

  alternates: {
    canonical: TEMPLE_URL,
  },

  openGraph: {
    title: 'The Sanctuary — Digital Temple',

    description:
      'A living digital sanctuary of presence, ritual and traces. Enter the Digital Temple by Merkurov Love.',

    url: TEMPLE_URL,

    siteName: 'Merkurov Love',

    images: [
      {
        url: TEMPLE_IMAGE,
        width: 1024,
        height: 1024,
        alt: 'The Sanctuary — Heart & Angel Digital Temple',
      },
    ],

    locale: 'en_US',

    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',

    title: 'The Sanctuary — Digital Temple',

    description:
      'A living digital sanctuary of presence, ritual and traces.',

    images: [TEMPLE_IMAGE],

    creator: '@merkurov',
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  category: 'art',
};

export default function TemplePage() {
  return <TempleClient />;
}