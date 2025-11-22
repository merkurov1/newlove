'use client';


import React from 'react';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

interface Props {
  images: string[];
  ctaHref?: string;
}

export default function HeartAndAngelSection({ images, ctaHref = '/heartandangel/NFT' }: Props) {
  const [index, setIndex] = React.useState(0);
  const current = images[index];
  const controls = [
    { label: 'Prev', action: 'prev' },
    { label: 'Next', action: 'next' },
    { label: 'Info', action: 'info' },
    { label: 'Download', action: 'download' },
  ];

  return (
    <section className="w-full flex flex-col items-center">
      {/* Museum Frame */}
      <div className="relative w-full max-w-4xl aspect-[4/3] bg-white shadow-inner flex items-center justify-center p-12 border border-neutral-200">
        {/* Blurred background */}
        <div className="absolute inset-0 z-0">
          <Image
            src={current}
            alt="art-bg"
            fill
            className="object-cover blur-lg brightness-75 opacity-40"
            draggable={false}
            style={{ zIndex: 0 }}
          />
        </div>
        {/* Main image */}
        <div className="relative z-10 flex items-center justify-center w-full h-full">
          <Image
            src={current}
            alt={`Heart & Angel #${index + 1}`}
            width={480}
            height={480}
            className="object-contain max-h-full shadow-2xl bg-white"
            draggable={false}
            style={{ maxWidth: '320px', maxHeight: '420px', margin: 'auto' }}
          />
        </div>
      </div>
      {/* Control Deck */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl mt-8">
        {controls.map((c, i) => (
          <button
            key={c.action}
            className="border border-neutral-800 py-4 text-xs font-bold uppercase tracking-[0.2em] hover:bg-neutral-900 hover:text-white transition-all duration-300 text-center bg-transparent"
            onClick={() => {
              if (c.action === 'prev') setIndex((idx: number) => (idx === 0 ? images.length - 1 : idx - 1));
              if (c.action === 'next') setIndex((idx: number) => (idx === images.length - 1 ? 0 : idx + 1));
              if (c.action === 'download') window.open(current, '_blank');
              // Info: could show modal or tooltip
            }}
            style={{ letterSpacing: '0.2em', fontFamily: 'Space Mono, Courier, monospace' }}
          >
            {c.label}
          </button>
        ))}
      </div>
      {/* Museum Placard */}
      <div className="max-w-md mx-auto mt-10 text-center text-base font-serif text-neutral-700 border-t border-neutral-200 pt-6">
        <h2 className="text-lg font-bold mb-2 tracking-tight">The Concept</h2>
        <p className="text-sm leading-relaxed text-neutral-600">
          Heart & Angel is a transmedia art project about choice, archetypes, and digital identity. Each image is a digital artifact, presented as in a museum archive. No stretching, no filters—just pure presence.
        </p>
      </div>
    {/* Medium Section */}
    <div className="max-w-2xl w-full mb-6 px-4 text-left font-serif text-[0.95rem] sm:text-[1.05rem] md:text-[1.15rem] leading-[1.6] sm:leading-[1.7] text-neutral-900">
      <h3 className="text-lg sm:text-xl font-bold mb-2 text-black">The Medium</h3>
      <ul className="list-disc pl-6 mb-4">
        <li><span className="font-bold">Ink & Paper:</span> To ground the spirit in the physical moment.</li>
        <li><span className="font-bold">Digital & AR:</span> To let the symbol live in the ether.</li>
        <li><span className="font-bold">Code:</span> To turn empathy into a ritual.</li>
      </ul>
    </div>

    {/* Mission Section */}
    <div className="max-w-2xl w-full mb-6 px-4 text-left font-serif text-[0.95rem] sm:text-[1.05rem] md:text-[1.15rem] leading-[1.6] sm:leading-[1.7] text-neutral-900">
      <h3 className="text-lg sm:text-xl font-bold mb-2 text-black">The Mission</h3>
      <p className="mb-4">
        Can a simple symbol heal a complex trauma?<br/>
        This project explores love not as a romantic category, but as the only viable strategy for survival. It is an investigation into the physics of empathy.<br/>
        I do not aim to teach. I aim to remind.
      </p>
      <p className="italic text-neutral-700">Love is necessary. Love is never enough.</p>
    </div>
  </section>
  );
}
