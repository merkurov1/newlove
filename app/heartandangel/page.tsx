export const dynamic = 'force-dynamic';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Header from '@/components/Header';
import HeartAndAngelSection from '@/components/HeartAndAngelSection';

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

      {/* Hero-блок: на мобильных без растягивания (object-contain), на десктопе во весь экран (object-cover) */}
      <div className="relative w-full h-[500px] sm:h-[650px] md:h-[100dvh] flex flex-col justify-between overflow-hidden bg-[#FAF8F5]">
        <Image
          src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png"
          alt="Heart & Angel World"
          fill
          className="object-contain md:object-cover"
          priority
          draggable={false}
        />
        {/* Градиент для читаемости текста */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none md:bg-gradient-to-t md:from-black/80 md:via-black/25 md:to-black/40" />

        {/* Верхняя часть Hero: заголовок справа сверху */}
        <div className="relative z-10 max-w-7xl w-full mx-auto px-6 pt-24 sm:pt-32 md:pt-40 flex justify-end">
          <div className="text-right space-y-1 sm:space-y-2 max-w-lg text-white drop-shadow-md">
            <span className="text-[10px] sm:text-xs font-mono uppercase tracking-[0.25em] text-stone-200 block">
              Visual Mythology
            </span>
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-serif font-normal tracking-tight text-white">
              Heart &amp; Angel
            </h1>
            <p className="text-sm sm:text-base md:text-lg font-light text-stone-200 font-serif italic">
              A universal mythology for a fragmented world.
            </p>
          </div>
        </div>

        {/* Нижняя часть Hero: текст слева снизу, аккуратно сбалансированный */}
        <div className="relative z-10 max-w-7xl w-full mx-auto px-6 pb-8 sm:pb-16 md:pb-28 flex flex-col items-start space-y-3">
          <div className="max-w-xl space-y-2 sm:space-y-3 drop-shadow-md">
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-serif font-medium text-white tracking-tight">
              Enter the Living World
            </h2>
            <p className="text-white/90 text-xs sm:text-sm md:text-base font-light leading-relaxed max-w-md">
              Step into the eternal landscape where time flows, angels and demons coexist, and ambient music fills the air.
            </p>
            <div className="pt-1 sm:pt-2">
              <Link
                href="/heartandangel/world"
                className="inline-flex items-center gap-2 sm:gap-3 px-6 py-3 sm:px-8 sm:py-4 rounded-full bg-white text-stone-900 text-xs sm:text-sm font-medium tracking-wide shadow-2xl hover:bg-stone-100 transition-all duration-300"
              >
                <span>Explore World</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Основной контент страницы */}
      <div className="max-w-4xl mx-auto px-6 py-24 space-y-24">
        
        {/* Нарратив и манифест */}
        <article className="prose prose-lg prose-stone prose-p:font-light prose-p:leading-relaxed prose-headings:font-serif max-w-none w-full space-y-8 bg-white/80 backdrop-blur-md p-8 sm:p-12 rounded-3xl border border-stone-200/60 shadow-sm">
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

        {/* Галерея с работами */}
        <div className="w-full">
          <HeartAndAngelSection images={images} />
        </div>

        {/* Созвездие мини-проектов (3 карточки) */}
        <div className="w-full space-y-8">
          <div className="text-center">
            <span className="text-xs font-mono uppercase tracking-[0.25em] text-stone-400">
              Constellation
            </span>
            <h3 className="text-2xl font-serif text-stone-900 mt-2">Mini Projects</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {MINI_PROJECTS.map((proj, idx) => (
              <Link
                key={idx}
                href={proj.href}
                className="group p-8 rounded-3xl bg-white hover:bg-stone-50 border border-stone-200/80 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-6"
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
