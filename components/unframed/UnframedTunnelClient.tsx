"use client";

import React from 'react';
import TIMELINE from '@/lib/unframedTimeline';
import Image from 'next/image';
import GlitchCanvasFallback from './GlitchCanvasFallback';

export default function UnframedTunnelClient() {
  return (
    <div className="relative h-screen w-full">
      <div className="absolute inset-0 z-10">
        <GlitchCanvasFallback />
      </div>

      <div className="relative z-20">
        <div className="container mx-auto px-6 md:px-12">
          {TIMELINE.map((item, i) => (
            <section key={item.year} className="min-h-screen flex items-center" style={{ display: 'flex', alignItems: 'center' }}>
              <div className="max-w-3xl mx-auto">
                <div className="font-mono text-xs text-red-600 uppercase tracking-widest mb-4">{`0${i + 1} / ${item.year}`}</div>
                <h2 className="text-4xl md:text-6xl font-serif text-white mb-6">{item.title}</h2>
                <p className="text-xl md:text-2xl text-zinc-300 font-serif leading-relaxed">{item.text}</p>
                {item.image && (
                  <div className="mt-8 w-full max-w-2xl relative overflow-hidden">
                    <Image src={item.image} alt={item.title} width={1200} height={700} className="object-cover grayscale transition-all duration-500 hover:filter-none" />
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
