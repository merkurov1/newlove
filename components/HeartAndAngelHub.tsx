'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/Header';

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
    href: '/vigil',
  },
];

export default function HeartAndAngelHub() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const videoId = 'cfmUSH0rTno';

  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111] font-sans selection:bg-black selection:text-white relative overflow-x-hidden">
      <Header />

      {/* Hero-блок (клик по картинке убран, обертка заменена на div) */}
      <div className="relative w-full h-[500px] sm:h-[650px] md:h-[100dvh] flex flex-col justify-between overflow-hidden bg-[#FAF8F5]">
        <Image
          src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png"
          alt="Heart & Angel World"
          fill
          className="object-contain md:object-cover transition-transform duration-700"
          priority
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none md:bg-gradient-to-t md:from-black/80 md:via-black/25 md:to-black/40" />

        <div className="relative z-10 max-w-7xl w-full mx-auto px-6 pt-24 sm:pt-32 md:pt-40 flex justify-end">
          <div className="text-right space-y-2 sm:space-y-3 max-w-xl text-white drop-shadow-lg">
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-serif font-light tracking-tight text-white">
              Heart &amp; Angel
            </h1>
            <p className="text-base sm:text-lg md:text-xl font-serif italic font-normal tracking-wide text-stone-200">
              The universal mythology for a fragmented world.
            </p>
            <p className="text-xs sm:text-sm font-sans tracking-[0.3em] uppercase text-stone-300 font-medium pt-1">
              The Greatest love story ever told.
            </p>
          </div>
        </div>

        <div className="relative z-10 max-w-7xl w-full mx-auto px-6 pb-8 sm:pb-16 md:pb-28 flex flex-col items-start space-y-3">
          <div className="max-w-xl space-y-3 drop-shadow-lg">
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-serif font-light tracking-wider text-white">
              Enter the Living World
            </h2>
            <p className="text-stone-100 text-sm sm:text-base md:text-lg font-serif font-light leading-relaxed max-w-md tracking-wide">
              Step into the eternal landscape where time flows, angels and demons coexist, and ambient music fills the air.
            </p>
            <div className="pt-2">
              <Link
                href="/heartandangel/world"
                className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-white text-stone-900 text-xs sm:text-sm font-sans font-medium tracking-widest uppercase shadow-2xl hover:bg-stone-100 transition-all duration-300 cursor-pointer"
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
        
        {/* 1. Нарратив и манифест */}
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
            &quot;Simplicity is the ultimate sophistication of survival.&quot;
          </blockquote>

          <p>
            Each piece serves as both a physical artifact and a digital token—anchoring emotional 
            capital onto decentralized ledgers to ensure permanence across mediums.
          </p>
        </article>

        {/* 2. Увеличенный живой видеопортал */}
        <div className="w-full">
          <div 
            onClick={() => setIsModalOpen(true)}
            className="group relative w-full aspect-[16/9] sm:aspect-[16/10] rounded-3xl overflow-hidden bg-stone-900 shadow-2xl cursor-pointer border border-stone-200/80 transition-all duration-500 hover:scale-[1.01]"
          >
            <div className="absolute inset-0 pointer-events-none scale-125 opacity-90 transition-opacity duration-500 group-hover:opacity-100">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&disablekb=1&modestbranding=1&iv_load_policy=3`}
                title="Heart & Angel Portal"
                className="w-full h-full object-cover border-0"
                allow="autoplay"
              />
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

            <div className="absolute bottom-6 right-6 z-10">
              <span className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30 group-hover:bg-white group-hover:text-stone-900 transition-colors shadow-lg">
                ▶
              </span>
            </div>
          </div>
        </div>

        {/* 3. Галерея подряд (лента с сохранением оригинальных пропорций) */}
        <div className="w-full space-y-12">
          {images.map((src, idx) => (
            <div 
              key={idx} 
              className="relative w-full bg-white border border-stone-200/80 p-6 sm:p-12 rounded-3xl shadow-sm flex flex-col items-center group transition-all duration-500 hover:border-stone-400"
            >
              <div className="w-full flex justify-between items-center mb-6">
                <span className="font-mono text-xs uppercase tracking-widest text-stone-400">
                  Artifact 0{idx + 1}
                </span>
                <span className="font-mono text-[10px] text-stone-400">
                  REF_{String(idx + 1).padStart(2, '0')}
                </span>
              </div>
              
              <div className="relative w-full max-w-3xl aspect-[4/3] sm:aspect-[16/10] flex items-center justify-center">
                <Image
                  src={src}
                  alt={`Artifact ${idx + 1}`}
                  fill
                  className="object-contain drop-shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]"
                  sizes="(max-width: 1024px) 100vw, 800px"
                />
              </div>
            </div>
          ))}
        </div>

        {/* 4. Блок The Concept */}
        <div className="w-full bg-white/80 backdrop-blur-md p-8 sm:p-12 rounded-3xl border border-stone-200/60 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
            <div className="md:col-span-7 space-y-6">
              <h2 className="font-serif text-2xl text-black tracking-tight">
                The Concept
              </h2>
              <p className="font-serif text-lg text-neutral-800 leading-relaxed">
                Heart &amp; Angel is a transmedia art project about choice, archetypes, and digital identity. 
                Each image is a digital artifact. We do not stretch them to fit screens; 
                we build the space around them to honor their scale.
              </p>
              <p className="font-serif text-base text-neutral-600 leading-relaxed">
                This project explores love not as a romantic category, but as the only viable strategy for survival. 
                It is an investigation into the physics of empathy in a broken world.
              </p>
            </div>

            <div className="md:col-span-5 space-y-8 pt-2 md:pt-0">
              <div>
                <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">
                  The Medium
                </h3>
                <ul className="space-y-3 text-sm font-serif text-neutral-900">
                  <li className="flex items-start">
                    <span className="w-24 font-bold shrink-0">Ink &amp; Paper</span>
                    <span>Grounding the spirit in the physical.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="w-24 font-bold shrink-0">Digital / AR</span>
                    <span>Living in the ether.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="w-24 font-bold shrink-0">Code</span>
                    <span>Empathy as a ritual.</span>
                  </li>
                </ul>
              </div>

              <div className="border-l-2 border-black pl-4">
                <p className="italic font-serif text-neutral-500">
                  &quot;Love is necessary. Love is never enough.&quot;
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Мини-проекты */}
        <div className="w-full space-y-8">
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

      {/* Модальное окно для полноэкранного просмотра со звуком */}
      {isModalOpen && (
        <div 
          onClick={() => setIsModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-8 animate-fadeIn"
        >
          <div 
            onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}
            className="relative w-full max-w-5xl aspect-[16/9] bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10"
          >
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/40 transition-colors"
            >
              ✕
            </button>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=1&modestbranding=1`}
              title="Heart & Angel Archive Full"
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </main>
  );
}
