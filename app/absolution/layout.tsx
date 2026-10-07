import type { Metadata } from 'next';

const ABSOLUTION_URL =
  'https://www.merkurov.love/absolution';

const ABSOLUTION_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0947.png';

export const metadata: Metadata = {
  title: 'Online Absolution — Digital Temple',

  description:
    'Receive digital absolution, release a burden and leave it behind in the Sanctuary.',

  alternates: {
    canonical: ABSOLUTION_URL,
  },

  openGraph: {
    title: 'Online Absolution — Digital Temple',

    description:
      'Release a burden and receive digital absolution in the Sanctuary.',

    url: ABSOLUTION_URL,

    siteName: 'Merkurov Love',

    images: [
      {
        url: ABSOLUTION_IMAGE,
        width: 800,
        height: 800,
        alt: 'Online Absolution — Digital Temple',
      },
    ],

    locale: 'en_US',

    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',

    title: 'Online Absolution — Digital Temple',

    description:
      'Release a burden and receive digital absolution in the Sanctuary.',

    images: [ABSOLUTION_IMAGE],
  },

  robots: {
    index: true,
    follow: true,
  },
};

export default function AbsolutionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}