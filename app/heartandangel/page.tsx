export const dynamic = 'force-dynamic';

import React from 'react';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import HeartAndAngelSection from '@/components/HeartAndAngelSection';
import CenteredHeader from '@/components/CenteredHeader';
import Header from '@/components/Header';

export const metadata = sanitizeMetadata({
  title: 'Heart & Angel | Anton Merkurov',
  description: 'A universal mythology for a fragmented world.',
  alternates: {
    canonical: 'https://www.merkurov.love/heartandangel',
  },
  openGraph: {
    title: 'Heart & Angel | Anton Merkurov',
    description: 'A universal mythology for a fragmented world.',
    url: 'https://www.merkurov.love/heartandangel',
    siteName: 'Anton Merkurov',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Heart & Angel | Anton Merkurov',
    description: 'A universal mythology for a fragmented world.',
    creator: '@merkurov',
    site: '@merkurov',
  },
});

const images = [
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759212266765-IMG_0514.png',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759213959968-IMG_0517.png',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759231831822-IMG_0518.png',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759231854148-IMG_0519.jpeg',
];

export default function HeartAndAngelPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111] font-sans selection:bg-black selection:text-white relative overflow-x-hidden">

      {/* HEADER */}
      <Header />

      <div className="max-w-3xl mx-auto px-6 pt-36 md:pt-44 pb-24">
        <div className="flex flex-col items-center w-full">

          <CenteredHeader
            eyebrow={<>Visual Mythology</>}
            title={<>Heart &amp; Angel</>}
            subtitle={<>A universal mythology for a fragmented world.</>}
          />

          {/* Gallery Component */}
          <div className="w-full mt-6 mb-16">
            <HeartAndAngelSection images={images} />
          </div>

          {/* Content / Narrative */}
          <article className="prose prose-lg prose-stone prose-p:font-light prose-p:leading-relaxed prose-headings:font-serif max-w-none w-full space-y-8">
            <p className="first-letter:text-5xl first-letter:font-serif first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:mt-[-8px]">
              Heart &amp; Angel is an ongoing multidisciplinary art project exploring archetypal figures 
              through painting, digital graphics, augmented reality, and Web3 smart contract mechanics.
            </p>

            <p>
              In an era dominated by noise, algorithmic fragmentation, and cynicism, the project seeks 
              to reintroduce universal symbols that bypass intellectual defense mechanisms and speak 
              directly to human intuition.
            </p>

            <blockquote className="border-l-2 border-black pl-8 my-10 py-2 bg-white/50 p-6 rounded-r-2xl">
              <p className="text-2xl sm:text-3xl font-serif italic text-black leading-tight">
                "Simplicity is the ultimate sophistication of survival."
              </p>
            </blockquote>

            <p>
              Each piece serves as both a physical artifact and a digital token—anchoring emotional 
              capital onto decentralized ledgers to ensure permanence across mediums.
            </p>
          </article>

        </div>
      </div>
    </main>
  );
}
