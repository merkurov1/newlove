import { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata: Metadata = {
  title: 'The Vigil | Cabinet of Souls',
  description: 'An interactive art installation. Five hearts, waiting for your spark. The Internet is a cold void—we keep each other warm in the dark.',
  keywords: ['interactive art', 'vigil', 'cabinet of souls', 'digital presence', 'attention economy', 'conceptual art', 'entropy', 'collective ritual'],
  authors: [{ name: 'Anton Merkurov', url: 'https://merkurov.love' }],
  openGraph: {
    title: 'The Vigil - Cabinet of Souls',
    description: 'Matter is dead until you touch it. Light a heart. Transfer your spark. Keep it alive.',
    url: 'https://merkurov.love/vigil',
    siteName: 'Anton Merkurov',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif',
        width: 1200,
        height: 630,
        alt: 'The Vigil - An Angel watches over empty hearts',
        type: 'image/gif',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Vigil',
    description: 'Five hearts. One spark. 24 hours. We keep each other warm in the dark.',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif'],
    creator: '@merkurov',
    site: '@merkurov',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://merkurov.love/vigil',
  },
};

export default function VigilLayout({
  children,
}: {
  children: React.ReactNode;
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
