import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Digital Absolution | Confess Your Digital Sins',
  description: 'An interactive conceptual art experience. Confess your digital sins—doomscrolling, social media envy, crypto obsession—and receive absolution from Pierrot, your AI chaplain. Available in English, Russian, and Latin.',
  keywords: ['digital absolution', 'digital sins', 'conceptual art', 'interactive art', 'confession', 'web art', 'doomscrolling', 'AI chaplain', 'redemption', 'modern guilt'],
  authors: [{ name: 'Anton Merkurov', url: 'https://merkurov.love' }],
  openGraph: {
    title: 'Digital Absolution - Confess Your Digital Sins',
    description: 'An interactive art project exploring modern guilt. Confess your digital sins and receive your receipt of absolution.',
    url: 'https://merkurov.love/absolution',
    siteName: 'Anton Merkurov',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0947.png',
        width: 1200,
        height: 630,
        alt: 'Digital Absolution - Heart stamp with ABSOLVO',
        type: 'image/png',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Digital Absolution',
    description: 'Confess your digital sins and receive absolution. An interactive conceptual art experience.',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0947.png'],
    creator: '@merkurov',
    site: '@merkurov',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://merkurov.love/absolution',
  },
};

export default function AbsolutionLayout({
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
      {children}
    </>
  );
}
