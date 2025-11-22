'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface Props {
  images: string[];
}

export default function HeartAndAngelSection({ images }: Props) {
  const [index, setIndex] = React.useState(0);
  const current = images[index];

  // Функция переключения слайдов
  const handlePrev = () => setIndex((prev: number) => (prev === 0 ? images.length - 1 : prev - 1));
  const handleNext = () => setIndex((prev: number) => (prev === images.length - 1 ? 0 : prev + 1));

  return (
    <section className="w-full flex flex-col items-center">
      
      {/* MUSEUM FRAME (THE ARCHIVE VIEWER) */}
      {/* Контейнер фиксированной пропорции или высоты, создающий "Паспарту" */}
      <div className="relative w-full max-w-3xl bg-neutral-50 border border-neutral-200 shadow-sm p-8 md:p-16 flex items-center justify-center aspect-[4/3] md:aspect-square lg:aspect-[4/3]">
        
        {/* Номер слайда (как инвентарный номер) */}
        <div className="absolute top-4 right-4 font-mono text-[10px] text-neutral-400 tracking-widest">
          REF: {String(index + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}
        </div>

        {/* Изображение */}
        <div className="relative w-full h-full flex items-center justify-center">
          <Image
            src={current}
            alt={`Heart & Angel Artifact #${index + 1}`}
            width={800}
            height={800}
            className="object-contain max-h-full w-auto shadow-xl transition-opacity duration-500"
            draggable={false}
            priority
          />
        </div>
      </div>

      {/* CONTROL DECK (BRUTALIST NAVIGATION) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 w-full max-w-3xl mt-8 border-t border-l border-black">
        
        {/* 1. PREV BUTTON */}
        <button
          onClick={handlePrev}
          className="h-14 border-r border-b border-black flex items-center justify-center hover:bg-black hover:text-white transition-colors duration-200 group"
        >
          <span className="font-mono text-xs font-bold uppercase tracking-[0.15em] group-hover:tracking-[0.25em] transition-all">
            &lt; Prev
          </span>
        </button>

        {/* 2. LINK TO VIGIL */}
        <Link 
          href="/vigil"
          className="h-14 border-r border-b border-black flex items-center justify-center hover:bg-black hover:text-white transition-colors duration-200"
        >
          <span className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
            The Vigil
          </span>
        </Link>

        {/* 3. LINK TO ABSOLUTION */}
        <Link 
          href="/absolution"
          className="h-14 border-r border-b border-black flex items-center justify-center hover:bg-black hover:text-white transition-colors duration-200"
        >
          <span className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
            Absolution
          </span>
        </Link>

        {/* 4. NEXT BUTTON */}
        <button
          onClick={handleNext}
          className="h-14 border-r border-b border-black flex items-center justify-center hover:bg-black hover:text-white transition-colors duration-200 group"
        >
          <span className="font-mono text-xs font-bold uppercase tracking-[0.15em] group-hover:tracking-[0.25em] transition-all">
            Next &gt;
          </span>
        </button>
      </div>

      {/* TEXT: MUSEUM PLACARD STYLE */}
      <div className="max-w-xl mx-auto mt-12 space-y-8 text-center md:text-left">
        
        {/* The Concept */}
        <div className="space-y-3">
          <h2 className="font-serif text-xl text-black tracking-tight border-b border-neutral-200 pb-2 inline-block">
            The Concept
          </h2>
          <p className="font-serif text-neutral-600 leading-relaxed text-base">
            Heart & Angel is a transmedia art project about choice, archetypes, and digital identity. 
            Each image is a digital artifact, presented here as in a museum archive. 
            No stretching, no filters—just pure presence.
          </p>
        </div>

        {/* The Medium & Mission Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 text-sm leading-relaxed text-neutral-800 font-serif">
          
          {/* Medium */}
          <div>
            <h3 className="font-bold mb-2 uppercase text-xs tracking-widest font-mono text-neutral-400">Medium</h3>
            <ul className="space-y-2">
              <li><span className="font-semibold">Ink & Paper:</span> Grounding the spirit.</li>
              <li><span className="font-semibold">Digital & AR:</span> Living in the ether.</li>
              <li><span className="font-semibold">Code:</span> Empathy as a ritual.</li>
            </ul>
          </div>

          {/* Mission */}
          <div>
            <h3 className="font-bold mb-2 uppercase text-xs tracking-widest font-mono text-neutral-400">Statement</h3>
            <p>
              This project explores love not as a romantic category, but as the only viable strategy for survival.
            </p>
            <p className="mt-4 italic text-neutral-500 border-l-2 border-black pl-3">
              "Love is necessary. Love is never enough."
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}