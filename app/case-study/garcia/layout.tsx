import { ReactNode } from 'react';
import type { Metadata } from 'next';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

const title = "Aimée García — Untitled (Woman with Globe) | Case Study";
const description = "Aimée García, 1995 — a cinematic case study exploring provenance, material, and the acquisition protocol for Lot 59.";
const image = "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1047.jpeg";
const url = "https://www.merkurov.love/case-study/garcia";

export const metadata: Metadata = sanitizeMetadata({
  alternates: { canonical: url },
  title,
  description,
  keywords: ['Aimée García', 'case study', 'art', 'provenance', 'auction', 'Lot 59', 'Anton Merkurov'],
  authors: [{ name: 'Anton Merkurov', url: 'https://www.merkurov.love' }],
  openGraph: {
    type: 'article',
    url,
    title,
    description,
    images: [
      {
        url: image,
        width: 1200,
        height: 630,
        alt: 'Aimée García — Untitled (Woman with Globe)',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [image],
    creator: '@merkurov',
  },
});

const garciaJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: title,
  description,
  image: [image],
  author: { '@type': 'Person', name: 'Anton Merkurov', url: 'https://www.merkurov.love' },
  publisher: { '@type': 'Person', name: 'Anton Merkurov', url: 'https://www.merkurov.love' },
  url,
};

export default function GarciaLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(garciaJsonLd) }}
      />
      {children}
    </>
  );
}
