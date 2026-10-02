export const dynamic = 'force-dynamic';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import HeartAndAngelSection from '@/components/HeartAndAngelSection';
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
    title: 'Let It Go',
    description: 'Release burdens into the digital sky and watch them float away.',
    href: '/heartandangel/letitgo',
  },
  {
    title: 'Calm',
    description: 'Find serenity through gyroscope-driven balance and heartbeat interactions.',
    href: '/heartandangel/calm',
  },
  {
    title: 'Vigil',
    description: 'A quiet digital sanctuary for digital presence and shared observation.',
    href: '/heartandangel/vigil',
  },
];

export default function HeartAndAngelPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111] font-sans selection:bg-black selection:text-white relative overflow-x-hidden">
      <Header />

      <div className="max-w-4xl mx-auto px-6 pt-32 md:pt-40 pb-24 space-y-20">
        
        {/* Утонченный современный заголовок */}
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <span className="text-xs font-mono uppercase tracking-[0.25em] text-stone-400 block">
            Visual Mythology
          </span>
          <h1 className="text-4xl sm:text-6xl font-serif font-normal tracking-tight text-stone-900">
            Heart &amp; Angel
          </h1>
          <p className="text-lg sm:text-xl font-light text-stone-600 font-serif italic">
            A universal mythology for a fragmented world.
          </p>
        </div>

        {/* Флагманский блок World с фоновой картинкой World.png */}
        <div className="w-full">
          <Link 
            href="/heartandangel/world"
            className="group relative block w-full aspect-[16/9] sm:aspect-[2/1] rounded-3xl overflow-hidden shadow-2xl transition-transform duration-500 hover:scale-[1.01]"
          >
            <Image
              src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png"
              alt="Enter the Living World"
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-105"
              priority
            />
            {/* Градиент для читаемости текста */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent transition-opacity group-hover:opacity-90" />
            
            <div className="absolute inset-0 p-8 sm:p-12 flex flex-col justify-end items-start text-left z-10 space-y-3">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-medium text-white tracking-tight">
                Enter the Living World
              </h2>
              <p className="text-white/85 text-sm sm:text-base font-light max-w-lg leading-relaxed">
                Step into the eternal landscape where time flows, angels and demons coexist, and ambient music fills the air.
              </p>
              <div className="pt-2">
                <span className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-stone-900 text-sm font-medium tracking-wide shadow-lg group-hover:bg-stone-100 transition-colors">
                  <span>Explore World</span>
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Нарратив и манифест */}
        <article className="prose prose-lg prose-stone prose-p:font-light prose-p:leading-relaxed prose-headings:font-serif max-w-none w-full space-y-8 bg-white/60 backdrop-blur-sm p-8 sm:p-12 rounded-3xl border border-stone-200/60 shadow-sm">
          <p className="first-letter:text-5xl first-letter:font-serif first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:mt-[-8px]">
            Heart &amp; Angel is an ongoing multidisciplinary art project exploring archetypal figures 
            through painting, digital graphics, augmented reality, and Web3 smart contract mechanics.
          </p>

          <p>
            In an era dominated by noise, algorithmic fragmentation, and cynicism, the project seeks 
            to reintroduce universal symbols that bypass intellectual defense mechanisms and speak 
            directly to human intuition.
          </p>

          <blockquote className="border-l-2 border-stone-900 pl-6 my-8 py-2 italic font-serif text-xl sm:text-2xl text-stone-900">
            "Simplicity is the ultimate sophistication of survival."
          </blockquote>

          <p>
            Each piece serves as both a physical artifact and a digital token—anchoring emotional 
            capital onto decentralized ledgers to ensure permanence across mediums.
          </p>
        </article>

        {/* Галерея */}
        <div className="w-full">
          <HeartAndAngelSection images={images} />
        </div>

        {/* Созвездие мини-проектов (3 карточки без плашек) */}
        <div className="w-full space-y-6">
          <div className="text-center">
            <h3 className="text-xs font-mono uppercase tracking-[0.25em] text-stone-400">
              Constellation
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {MINI_PROJECTS.map((proj, idx) => (
              <Link
                key={idx}
                href={proj.href}
                className="group p-8 rounded-3xl bg-white/80 hover:bg-white border border-stone-200/80 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-6"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono tracking-widest text-stone-400 uppercase">
                      0{idx + 1}
                    </span>
                    <span className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 group-hover:bg-stone-900 group-hover:text-white transition-colors">
                      →
                    </span>
                  </div>
                  <h4 className="text-2xl font-serif font-medium text-stone-900">
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

      </div>
    </main>
  );
}
