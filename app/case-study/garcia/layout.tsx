import { ReactNode } from 'react';

const title = "Aimée García — Untitled (Woman with Globe) | Case Study";
const description = "Aimée García, 1995 — a cinematic case study exploring provenance, material, and the acquisition protocol for Lot 59.";
const image = "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1047.jpeg";
const url = "https://www.merkurov.love/case-study/garcia";

export const metadata = {
  title,
  description,
  keywords: ['Aimée García', 'case study', 'art', 'provenance', 'auction', 'Lot 59'],
  authors: [{ name: 'Anton Merkurov' }],
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
        alt: 'Aimée García — Untitled (Woman with Globe)'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@merkurov_love'
  }
};

export default function GarciaLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
