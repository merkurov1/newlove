export const dynamic = 'force-dynamic';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
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

const MINI_PROJECTS = [
  {
    title: 'World',
    subtitle: 'Flagship Interactive Ecosystem',
    description: 'A living, breathing digital landscape with dynamic time, ambient sound, and wandering archetypes.',
    href: '/heartandangel/world',
    badge: 'Main World',
    bg: 'from-[#87CEEB]/20 to-[#FFC8DD]/30',
  },
  {
    title: 'Let It Go',
    subtitle: 'Interactive Ritual',
    description: 'Release burdens into the digital sky and watch them float away.',
    href: '/heartandangel/letitgo',
    badge: 'Ritual',
    bg: 'from-[#BDE0FE]/30 to-[#A2D2FF]/30',
  },
  {
    title: 'Calm (Heart Physics)',
    subtitle: 'Meditative Physics',
    description: 'Find serenity through gyroscope-driven balance and heartbeat interactions.',
    href: '/heartandangel/calm',
    badge: 'Experience',
    bg: 'from-[#e8b4b8]/30 to-[#2b1d24]/10',
  },
  {
    title: 'Vigil',
    subtitle: 'Contemplative Space',
    description: 'A quiet digital sanctuary for digital presence and shared observation.',
    href: '/heartandangel/vigil',
    badge: 'Sanctuary',
    bg: 'from-[#3A506B]/20 to-[#1C2541]/20',
  },
];

export default function HeartAndAngelPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111] font-sans selection:bg-black selection:text-white relative overflow-x-hidden">
      <Header />

      <div className="max-w-4xl mx-auto px-6 pt-36 md:pt-44 pb-24">
        <div className="flex flex-col items-center w-full">

          <CenteredHeader
            eyebrow={<>Visual Mythology</>}
            title={<>Heart &amp; Angel</>}
            subtitle={<>A universal mythology for a fragmented world.</>}
          />

          {/* ФЛАГМАНСКИЙ БЛОК: WORLD */}
          <div className="w-full mt-10 mb-16">
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-b from-[#87CEEB] via-[#B0E0E6] to-[#4A7c23] p-8 md:p-12 shadow-2xl border border-white/50 text-white flex flex-col items-center text-center group">
              <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] transition-opacity group-hover:opacity-5" />
              
              <div className="relative z-10 max-w-xl space-y-4">
                <span className="inline-block px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-mono tracking-widest uppercase border border-white/30">
                  ✨ Flagship World
                </span>
                <h2 className="text-3xl md:text-5xl font-serif font-bold tracking-tight">
                  Enter the Living World
                </h2>
                <p className="text-white/90 text-base md:text-lg font-light leading-relaxed">
                  Step into the eternal landscape where time flows, angels and demons coexist, ambient music plays, and every touch brings a rain of hearts.
                </p>
                <div className="pt-4">
                  <Link
                    href="/heartandangel/world"
                    className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-white text-stone-900 font-medium tracking-wide shadow-lg hover:bg-stone-100 hover:scale-105 transition-all duration-300"
                  >
                    <span>Enter World</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* СЕТКА МИНИ-ПРОЕКТОВ */}
          <div className="w-full mb-16">
            <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-stone-500 mb-6 text-center">
              Constellation of Experiences
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {MINI_PROJECTS.map((proj, idx) => (
                <Link
                  key={idx}
                  href={proj.href}
                  className={`relative p-6 rounded-2xl bg-gradient-to-br ${proj.bg} border border-stone-200/80 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono uppercase tracking-wider text-stone-600 bg-white/60 px-2.5 py-1 rounded-full">
                        {proj.badge}
                      </span>
                      <span className="text-stone-400 group-hover:translate-x-1 transition-transform">
                        →
                      </span>
                    </div>
                    <h4 className="text-xl font-serif font-medium text-stone-900">
                      {proj.title}
                    </h4>
                    <p className="text-stone-600 text-sm font-light leading-relaxed">
                      {proj.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Галерея */}
          <div className="w-full mb-16">
            <HeartAndAngelSection images={images} />
          </div>

          {/* Манифест / Нарратив */}
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
