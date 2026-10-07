import type { Metadata } from 'next';
import AbsolutionClient from './AbsolutionClient';

const ABSOLUTION_URL = 'https://www.merkurov.love/absolution';

const ABSOLUTION_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0947.png';

export const metadata: Metadata = {
  title: 'Absolution — Digital Temple | Merkurov Love',

  description:
    'Release a digital burden and receive absolution in the Digital Temple. A ritual of letting go, lightness and freedom.',

  keywords: [
    'Absolution',
    'Digital Temple',
    'Merkurov Love',
    'Heart & Angel',
    'digital ritual',
    'online absolution',
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
    canonical: ABSOLUTION_URL,
  },

  openGraph: {
    title: 'Absolution — Digital Temple',
    description:
      'Release a digital burden and receive absolution in the Digital Temple.',
    url: ABSOLUTION_URL,
    siteName: 'Merkurov Love',

    images: [
      {
        url: ABSOLUTION_IMAGE,
        width: 1024,
        height: 1024,
        alt: 'Absolution — Digital Temple',
      },
    ],

    locale: 'en_US',
    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Absolution — Digital Temple',
    description:
      'Release a digital burden and receive absolution in the Digital Temple.',
    images: [ABSOLUTION_IMAGE],
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

export default function AbsolutionPage() {
  return <AbsolutionClient />;
}