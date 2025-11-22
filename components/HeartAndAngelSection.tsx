'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface Props {
  images: string[];
}

export default function HeartAndAngelSection({ images }: Props) {
  return (
    <section className="w-full flex flex-col items-center">
      
      {/* 1. THE GRID (WALL OF ARTIFACTS) */}
      {/* Показываем все картинки сразу. Сетка заполняет пустоту. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl mb-16">
        {images.map((src, idx) => (
          <div 
            key={idx} 
            className="relative w-full aspect-square bg-neutral-50 border border-neutral-200 p-8 flex items-center justify-center group transition-all duration-500 hover:border-neutral-400"
          >
            {/* Декоративный номер артефакта */}
            <div className="absolute top-4 right-4 font-mono text-[10px] text-neutral-300 group-hover:text-neutral-500 transition-colors">
              REF_{String(idx + 1).padStart(2, '0')}
            </div>
            
            <div className="relative w-full h-full">
              <Image
                src={src}
                alt={`Artifact ${idx + 1}`}
                fill
                className="object-contain drop-shadow-xl transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </div>
        ))}
      </div>

      {/* 2. PROJECT NAVIGATION (THE TRINITY) */}
      {/* Жесткая панель ссылок на проекты */}
      <div className="w-full max-w-5xl border border-black">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-black">
          
          {/* LINK: THE VIGIL */}
          <Link 
            href="/vigil"
            className="h-16 flex items-center justify-center hover:bg-black hover:text-white transition-colors duration-200"
          >
            <span className="font-mono text-xs font-bold uppercase tracking-[0.2em]">
              The Vigil
            </span>
          </Link>

          {/* LINK: LET IT GO (ВОССТАНОВЛЕНО) */}
          <Link 
            href="/heartandangel/letitgo"
            className="h-16 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors duration-200"
          >
            <span className="font-mono text-xs font-bold uppercase tracking-[0.2em]">
              Let It Go
            </span>
          </Link>

          {/* LINK: ABSOLUTION */}
          <Link 
            href="/absolution"
            className="h-16 flex items-center justify-center hover:bg-black hover:text-white transition-colors duration-200"
          >
            <span className="font-mono text-xs font-bold uppercase tracking-[0.2em]">
              Absolution
            </span>
          </Link>
        </div>
      </div>

      {/* 3. MANIFESTO (STRUCTURED TEXT) */}
      <div className="w-full max-w-5xl mt-16 border-t border-neutral-200 pt-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          
          {/* Left Column: Concept */}
          <div className="md:col-span-7 space-y-6">
            <h2 className="font-serif text-2xl text-black tracking-tight">
              The Concept
            </h2>
            <p className="font-serif text-lg text-neutral-800 leading-relaxed">
              Heart & Angel is a transmedia art project about choice, archetypes, and digital identity. 
              Each image is a digital artifact. We do not stretch them to fit screens; 
              we build the space around them to honor their scale.
            </p>
            <p className="font-serif text-base text-neutral-600 leading-relaxed">
              This project explores love not as a romantic category, but as the only viable strategy for survival. 
              It is an investigation into the physics of empathy in a broken world.
            </p>
          </div>

          {/* Right Column: Details */}
          <div className="md:col-span-5 space-y-8 pt-2 md:pt-0">
            
            <div>
              <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">
                The Medium
              </h3>
              <ul className="space-y-3 text-sm font-serif text-neutral-900">
                <li className="flex items-start">
                  <span className="w-24 font-bold shrink-0">Ink & Paper</span>
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
                "Love is necessary. Love is never enough."
              </p>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}