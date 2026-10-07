import type { Metadata } from 'next';

const VIGIL_URL =
  'https://www.merkurov.love/vigil';

const VIGIL_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';

export const metadata: Metadata = {
  title: 'Vigil — Digital Temple',

  description:
    'Keep the heart alive. Vigil is a shared digital ritual of presence, light and guardianship.',

  alternates: {
    canonical: VIGIL_URL,
  },

  openGraph: {
    title: 'Vigil — Digital Temple',

    description:
      'Keep the heart alive. A shared digital ritual of presence and light.',

    url: VIGIL_URL,

    siteName: 'Merkurov Love',

    images: [
      {
        url: VIGIL_IMAGE,
        width: 800,
        height: 800,
        alt: 'Vigil — Heart & Angel',
      },
    ],

    locale: 'en_US',

    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',

    title: 'Vigil — Digital Temple',

    description:
      'Keep the heart alive. A shared digital ritual of presence and light.',

    images: [VIGIL_IMAGE],
  },

  robots: {
    index: true,
    follow: true,
  },
};

export default function VigilLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}