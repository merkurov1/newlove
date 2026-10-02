'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Sparkles, Play } from 'lucide-react';

const ASSETS = {
  angel: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png',
  daemon: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Daemon1.png',
  heart: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0920.png',
};

export default function HeartAndAngelPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] text-stone-900 font-sans selection:bg-orange-500/20 overflow-x-hidden">
      
      {/* DECORATIVE TOP BORDER */}
      <div className="h-1 w-full bg-black fixed top-0 z-50" />

      {/* NAVIGATION / BACK TO TEMPLE */}
      <div className="max-w-5xl mx-auto px-6 pt-8 pb-4 flex justify-between items-center">
        <Link 
          href="/temple"
          className="font-serif text-sm tracking-widest text-stone-600 hover:text-black transition-colors"
        >
          ← Back to Temple
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-stone-400">
          #HEARTANDANGEL
        </span>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12 md:py-20 flex flex-col items-center space-y-24">
        
        {/* 1. HERO SECTION */}
        <section className="w-full flex flex-col items-center text-center space-y-8">
          <div className="space-y-4 max-w-2xl">
            <h1 
              className="font-serif text-5xl sm:text-7xl md:text-8xl font-light tracking-tight text-stone-900"
              style={{ fontFamily: 'Cormorant Garamond, serif' }}
            >
              Heart &amp; Angel
            </h1>
            <p className="font-serif text-xl sm:text-2xl md:text-3xl text-stone-700 italic font-light leading-relaxed">
              The universal mythology for a fragmented world.
            </p>
            <p className="font-mono text-xs sm:text-sm uppercase tracking-[0.25em] text-stone-500 pt-2">
              The Greatest love story ever told.
            </p>
          </div>

          {/* Visual preview or artwork */}
          <div className="relative w-full max-w-md h-72 sm:h-96 my-6 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-200/40 via-orange-100/20 to-transparent rounded-full blur-3xl pointer-events-none" />
            <Image 
              src={ASSETS.angel} 
              alt="Heart & Angel Artwork" 
              fill 
              className="object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.15)]"
              priority 
            />
          </div>

          {/* Enter the living world button */}
          <div className="pt-4">
            <Link 
              href="/heartandangel/world"
              className="group inline-flex items-center gap-4 px-8 py-4 rounded-full bg-stone-900 text-white hover:bg-stone-800 transition-all shadow-xl hover:scale-105 cursor-pointer font-mono text-xs tracking-[0.25em] uppercase"
            >
              <span>Enter the living world</span>
              <ArrowLeft size={16} className="rotate-180 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </section>

        {/* 2. DESCRIPTION BLOCK */}
        <section className="w-full max-w-2xl space-y-6 text-center sm:text-left border-y border-stone-200 py-16">
          <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-stone-400 text-center sm:text-left">
            Manifesto &amp; Presence
          </h2>
          <p className="font-serif text-xl sm:text-2xl font-light leading-relaxed text-stone-800">
            Angel and Demon—non-binary archetypes navigating existence—communicate with the Heart across changing circumstances. The core thesis is simple yet radical: to promote love, care, and unconditional respect in a hyper-digital era.
          </p>
          <p className="font-serif text-base font-light leading-relaxed text-stone-600">
            This is a transmedia project uniting humanity and technology. Through presence, shared rituals, and modern spatial protocols, we build a sanctuary where every visitor leaves an indelible trace.
          </p>
        </section>

        {/* 3. YOUTUBE BLOCK */}
        <section className="w-full space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-stone-400">
              Moving Image / Cinematic
            </h2>
            <Play size={16} className="text-stone-400" />
          </div>
          <div className="relative w-full aspect-video rounded-3xl overflow-hidden shadow-2xl bg-stone-900 border border-stone-200">
            <iframe 
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" // Замените на актуальную ссылку YouTube видео проекта
              title="Heart & Angel Cinematic"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowFullScreen
            />
          </div>
        </section>

        {/* 4. CONCEPT BLOCK */}
        <section className="w-full grid grid-cols-1 md:grid-cols-2 gap-10 items-center bg-stone-100/70 p-8 sm:p-12 rounded-3xl border border-stone-200/80">
          <div className="space-y-4">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-orange-600">Core Concept</span>
            <h3 className="font-serif text-3xl sm:text-4xl font-light text-stone-900">
              The Network of Hearts
            </h3>
            <p className="font-serif text-stone-700 font-light leading-relaxed text-base">
              Everything starts with a heart. In cities and virtual realms alike, hearts are scattered as focal points of attention. Finding them requires presence, walking, and tuned awareness.
            </p>
          </div>
          <div className="relative w-full h-64 flex items-center justify-center">
            <Image 
              src={ASSETS.heart} 
              alt="Heart Concept" 
              width={260} 
              height={260} 
              className="object-contain drop-shadow-[0_15px_30px_rgba(255,100,100,0.3)] animate-pulse" 
            />
          </div>
        </section>

        {/* 5. GALLERY BLOCK */}
        <section className="w-full space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-stone-400">
              Visual Archive &amp; Artifacts
            </h2>
            <span className="font-mono text-xs text-stone-400">Gallery</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-stone-200 shadow-lg border border-stone-200 group">
              <Image 
                src={ASSETS.angel} 
                alt="Artifact Angel" 
                fill 
                className="object-contain p-8 group-hover:scale-105 transition-transform duration-700" 
              />
              <div className="absolute bottom-4 left-4 right-4 p-4 rounded-2xl bg-white/80 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="font-serif text-sm font-medium">Guardian Archetype I</p>
                <p className="font-mono text-[10px] opacity-60 uppercase">Digital Print / Canvas</p>
              </div>
            </div>

            <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-stone-200 shadow-lg border border-stone-200 group">
              <Image 
                src={ASSETS.daemon} 
                alt="Artifact Daemon" 
                fill 
                className="object-contain p-8 group-hover:scale-105 transition-transform duration-700" 
              />
              <div className="absolute bottom-4 left-4 right-4 p-4 rounded-2xl bg-white/80 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="font-serif text-sm font-medium">Daemon Archetype I</p>
                <p className="font-mono text-[10px] opacity-60 uppercase">Digital Print / Canvas</p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. END / FOOTER */}
        <footer className="w-full pt-12 pb-8 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-center">
          <div className="font-mono text-xs uppercase tracking-widest text-stone-500">
            &copy; {new Date().getFullYear()} Anton Merkurov
          </div>
          <Link 
            href="/temple"
            className="font-serif text-sm text-stone-800 hover:text-black underline tracking-wide"
          >
            Return to Digital Temple
          </Link>
        </footer>

      </div>
    </main>
  );
}
