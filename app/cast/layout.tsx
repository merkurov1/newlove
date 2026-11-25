import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

// Ссылка на твое превью в Supabase
const OG_IMAGE_URL = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/cast_og.jpeg'

export const metadata: Metadata = {
  title: 'THE CAST // MERKUROV',
  description: '10 Questions. An AI reading. Are you Noise, Stone, or Void? The Cast is waiting.',
  metadataBase: new URL('https://www.merkurov.love'),
  alternates: { canonical: 'https://www.merkurov.love/cast' },
  openGraph: {
    title: 'THE CAST // MERKUROV',
    description: 'A strict reading. No flattery. Only truth.',
    url: '/cast',
    siteName: 'MERKUROV.LOVE',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: 'The Cast',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'THE CAST // A READING',
    description: 'A strict reading. No flattery. Only truth.',
    images: [OG_IMAGE_URL],
  },
  robots: {
    index: true,
    follow: true,
  }
}

export default function CastLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <script
        defer
        src="https://cloud.umami.is/script.js"
        data-website-id="87795d47-f53d-4ef8-8e82-3ee195ea997b"
      ></script>
      <Analytics />
      <SpeedInsights />
      {children}
    </>
  );
}
