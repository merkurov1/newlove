'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/Header';
import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode, Mousewheel } from 'swiper/modules';
import 'swiper/css/free-mode';

const galleryImages = [
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Gallery/IMG_1508.JPG',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Gallery/IMG_1510.JPG',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Gallery/IMG_1511.JPG',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Gallery/IMG_1513.JPG',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Gallery/IMG_1514.JPG',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Gallery/IMG_1516.JPG',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Gallery/IMG_1517.JPG',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Gallery/IMG_1519.JPG',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Gallery/IMG_1521.JPG',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Gallery/IMG_1522.JPG',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Gallery/IMG_1523.JPG',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Gallery/IMG_1524.JPG',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Gallery/IMG_1525.JPG',
];

const SOCIAL_LINKS = [
  { name: 'YouTube', href: 'https://www.instagram.com/heart_and_angel' },
  { name: 'Instagram', href: 'https://www.instagram.com/heart_and_angel' },
  { name: 'TikTok', href: 'https://www.tiktok.com/@merkurov' },
  { name: 'Facebook', href: 'https://www.facebook.com/heartandangel.love' },
  { name: 'Telegram', href: 'https://t.me/heartandangel' },
  { name: 'Patreon', href: 'https://www.patreon.com/c/heartandangel' },
];

export default function HeartAndAngelHub() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const videoId = 'cfmUSH0rTno';

  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111] font-sans selection:bg-black selection:text-white relative overflow-x-hidden">
      <Header />

      {/* Hero-блок: раздельный для мобильных и десктопа */}
      <div className="relative w-full bg-[#EAF2F8] md:bg-[#FAF8F5] md:h-[100dvh] md:flex md:flex-col md:justify-between md:overflow-hidden">
        
        {/* Desktop background image */}
        <div className="hidden md:block absolute inset-0">
          <Image
            src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png"
            alt="Heart & Angel World"
            fill
            className="object-cover transition-transform duration-700"
            priority
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/40 pointer-events-none" />
        </div>

        {/* --- МОБИЛЬНАЯ ВЕРСИЯ (< md): компактная, все помещается на экран iPhone 11 --- */}
        <div className="flex md:hidden min-h-[calc(100vh-70px)] pt-20 pb-6 px-5 flex-col justify-between bg-[#EAF2F8]">
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-serif font-light tracking-wider text-zinc-900">
              Heart &amp; Angel
            </h1>
            <p className="text-zinc-600 text-xs font-serif font-light leading-relaxed tracking-wide">
              The universal mythology for a fragmented world.
            </p>
            <p className="text-zinc-600 text-xs font-serif font-light leading-relaxed tracking-wide italic">
              The Greatest Love Story Ever Told.
            </p>
          </div>

          {/* Иллюстрация без рамки и фона */}
          <div className="relative w-full h-44 my-2">
            <Image
              src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png"
              alt="Heart & Angel World"
              fill
              className="object-contain drop-shadow-md"
              priority
              draggable={false}
            />
          </div>

          <div className="text-center space-y-3">
            <h2 className="text-xl font-serif font-light tracking-wider text-zinc-900">
              Enter the Living World
            </h2>
            <p className="text-zinc-600 text-xs font-serif font-light leading-relaxed tracking-wide max-w-xs mx-auto">
              Step into the eternal landscape where time flows, angels and demons coexist, and ambient music fills the air.
            </p>
            <div>
              <Link
                href="/heartandangel/world"
                className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-full bg-zinc-900 text-white text-xs font-sans font-medium tracking-widest uppercase shadow-md hover:bg-zinc-800 transition-all duration-300 cursor-pointer"
              >
                <span>Explore World</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* --- ДЕСКТОПНАЯ ВЕРСИЯ (md:): оригинальный полноэкранный дизайн --- */}
        <div className="hidden md:flex flex-col justify-between h-full relative z-10">
          <div className="max-w-7xl w-full mx-auto px-10 pt-36 flex justify-end">
            <div className="text-right space-y-3 max-w-lg text-white drop-shadow-lg">
              <h1 className="text-6xl font-serif font-light tracking-wider text-white">
                Heart &amp; Angel
              </h1>
              <p className="text-stone-100 text-lg font-serif font-light leading-relaxed tracking-wide">
                The universal mythology for a fragmented world.
              </p>
              <p className="text-stone-100 text-lg font-serif font-light leading-relaxed tracking-wide italic pt-0.5">
                The Greatest Love Story Ever Told.
              </p>
            </div>
          </div>

          <div className="max-w-7xl w-full mx-auto px-10 pb-28 flex flex-col items-start space-y-3">
            <div className="max-w-xl space-y-3 drop-shadow-lg">
              <h2 className="text-6xl font-serif font-light tracking-wider text-white">
                Enter the Living World
              </h2>
              <p className="text-stone-100 text-lg font-serif font-light leading-relaxed max-w-md tracking-wide">
                Step into the eternal landscape where time flows, angels and demons coexist, and ambient music fills the air.
              </p>
              <div className="pt-2">
                <Link
                  href="/heartandangel/world"
                  className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-white text-stone-900 text-sm font-sans font-medium tracking-widest uppercase shadow-2xl hover:bg-stone-100 transition-all duration-300 cursor-pointer"
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

      </div>

      {/* Основной контент страницы */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-24 space-y-12 sm:space-y-24">
        
        {/* 1. Нарратив и манифест */}
        <article className="prose prose-stone prose-p:font-light prose-p:leading-relaxed prose-headings:font-serif max-w-none w-full space-y-6 sm:space-y-8 bg-white/80 backdrop-blur-md p-6 sm:p-12 rounded-3xl border border-stone-200/60 shadow-sm text-sm sm:text-lg">
          <p className="first-letter:text-4xl sm:first-letter:text-5xl first-letter:font-serif first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:mt-[-4px]">
            Heart &amp; Angel is an ongoing multidisciplinary art project exploring archetypal figures 
            through painting, digital graphics, augmented reality, and Web3 smart contract mechanics.
          </p>

          <p>
            In an era dominated by noise, algorithmic fragmentation, and cynicism, the project seeks 
            to reintroduce universal symbols that bypass intellectual defense mechanisms and speak 
            directly to human intuition.
          </p>

          <blockquote className="border-l-2 border-stone-900 pl-4 sm:pl-6 my-6 sm:my-8 py-2 italic font-serif text-lg sm:text-2xl text-stone-900">
            &quot;Simplicity is the ultimate sophistication of survival.&quot;
          </blockquote>

          <p>
            Each piece serves as both a physical artifact and a digital token—anchoring emotional 
            capital onto decentralized ledgers to ensure permanence across mediums.
          </p>
        </article>

        {/* 2. Увеличенный живой видеопортал (YouTube) */}
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

            <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-10">
              <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30 group-hover:bg-white group-hover:text-stone-900 transition-colors shadow-lg text-sm sm:text-base">
                ▶
              </span>
            </div>
          </div>
        </div>

        {/* 3. Блок The Concept */}
        <div className="w-full bg-white/80 backdrop-blur-md p-6 sm:p-12 rounded-3xl border border-stone-200/60 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 sm:gap-10">
            <div className="md:col-span-7 space-y-4 sm:space-y-6">
              <h2 className="font-serif text-xl sm:text-2xl text-black tracking-tight">
                The Concept
              </h2>
              <p className="font-serif text-base sm:text-lg text-neutral-800 leading-relaxed">
                Heart &amp; Angel is a transmedia art project about choice, archetypes, and digital identity. 
                Each image is a digital artifact. We do not stretch them to fit screens; 
                we build the space around them to honor their scale.
              </p>
              <p className="font-serif text-sm sm:text-base text-neutral-600 leading-relaxed">
                This project explores love not as a romantic category, but as the only viable strategy for survival. 
                It is an investigation into the physics of empathy in a broken world.
              </p>
            </div>

            <div className="md:col-span-5 space-y-6 sm:space-y-8 pt-2 md:pt-0">
              <div>
                <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">
                  The Medium
                </h3>
                <ul className="space-y-3 text-xs sm:text-sm font-serif text-neutral-900">
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
                <p className="italic font-serif text-neutral-500 text-sm sm:text-base">
                  &quot;Love is necessary. Love is never enough.&quot;
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Галерея: Swiper горизонтальная прокрутка */}
        <div className="w-full">
          <Swiper
            modules={[FreeMode, Mousewheel]}
            spaceBetween={24}
            slidesPerView={'auto'}
            freeMode={true}
            mousewheel={{ forceToAxis: true }}
            grabCursor={true}
            className="w-full !overflow-visible py-2"
          >
            {galleryImages.map((src, idx) => (
              <SwiperSlide key={idx} className="!w-[360px] sm:!w-[520px] shrink-0">
                <div className="relative w-full aspect-[4/3] rounded-3xl overflow-hidden bg-white shadow-sm border border-stone-200/60 flex items-center justify-center p-3 group">
                  <Image
                    src={src}
                    alt={`Gallery Artifact ${idx + 1}`}
                    fill
                    className="object-contain rounded-2xl transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 360px, 520px"
                  />
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        {/* 5. Блок социальных сетей */}
        <div className="w-full bg-white/80 backdrop-blur-md p-8 sm:p-12 rounded-3xl border border-stone-200/60 shadow-sm text-center space-y-6">
          <h3 className="font-serif text-xl sm:text-2xl text-stone-900 tracking-tight">
            Connect &amp; Follow
          </h3>
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 pt-1">
            {SOCIAL_LINKS.map((social, idx) => (
              <a
                key={idx}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 rounded-full bg-stone-100 hover:bg-stone-900 hover:text-white text-stone-800 text-xs sm:text-sm font-mono tracking-wider uppercase transition-all duration-300 border border-stone-200/80 shadow-sm"
              >
                {social.name}
              </a>
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
