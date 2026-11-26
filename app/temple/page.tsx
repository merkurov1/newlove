// app/temple/page.tsx

import type { Metadata } from 'next';
import TempleClient from './TempleClient';
import { TEMPLE_HOME_ASSETS } from '@/lib/temple/homeAssets';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { resolveTempleFeed } from '@/lib/temple/feed.server';
import type { TempleFeedPayload } from '@/lib/temple/feed';

export const dynamic = 'force-dynamic';

const TEMPLE_URL = 'https://www.merkurov.love/temple';

const TEMPLE_IMAGE = TEMPLE_HOME_ASSETS.heart;

const TEMPLE_IMAGE_ALT =
  'The shared heart medallion at the centre of the Digital Temple';

export const metadata: Metadata = {
  title: 'The Sanctuary — Digital Temple | Merkurov Love',

  description:
    'A living digital sanctuary of presence, ritual and traces. Enter the Digital Temple by Merkurov Love and leave a mark in the chronicle.',

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
      'A living digital sanctuary of presence, ritual and traces. Enter the Digital Temple by Merkurov Love and leave a mark in the chronicle.',

    url: TEMPLE_URL,

    siteName: 'Merkurov Love',

    images: [
      {
        url: TEMPLE_IMAGE,
        width: 672,
        height: 672,
        alt: TEMPLE_IMAGE_ALT,
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

    images: [
      {
        url: TEMPLE_IMAGE,
        width: 672,
        height: 672,
        alt: TEMPLE_IMAGE_ALT,
      },
    ],

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

export default async function TemplePage() {
  let initialFeed: TempleFeedPayload | null = null;

  try {
    const result = await resolveTempleFeed({
      getClient: () => getServerSupabaseClient({ useServiceRole: true }),
    });

    initialFeed = result.payload;
  } catch (error) {
    // The client hook retries and falls back to its last known good browser
    // snapshot. A server read failure must not take down the Temple.
    console.error('[temple] initial feed unavailable:', error);
  }

  return <TempleClient initialFeed={initialFeed} />;
}
