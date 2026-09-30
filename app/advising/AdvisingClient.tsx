'use client';

import React from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { ArrowRight } from 'lucide-react';

export default function AdvisingClient() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] antialiased relative overflow-x-hidden">
      
      {/* Header */}
      <Header />

      {/* Subtle Paper Grain Texture */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="max-w-4xl mx-auto px-8 md:px-16 pt-36 md:pt-44 pb-32 relative z-20 space-y-20">
        
        {/* Header */}
        <header className="space-y-6 border-b border-zinc-300/60 pb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 font-mono">
            The Private Office // Anton Merkurov
          </p>
          <h1 className="text-4xl md:text-6xl font-serif font-normal tracking-tight text-[#111111] leading-[1.1]">
            Heritage Architecture for the Post-Digital Age.
          </h1>
          <p className="text-xl text-zinc-600 font-serif leading-relaxed">
            Art Advisory, Legacy Structures, and Digital Sovereignty.
          </p>
        </header>

        {/* Manifesto */}
        <section className="space-y-8 text-zinc-700 font-serif text-lg md:text-xl leading-relaxed">
          <p>
            The art world is full of noise. Galleries sell inventory. Algorithms manipulate taste. Auctions are theatre.
          </p>
          <p className="text-2xl md:text-3xl text-[#111111] font-normal">
            I offer silence.
          </p>
          <p>
            I do not just &quot;buy art&quot; for you. I build Legacy Structures for individuals who plan in decades, not quarters. 
            My approach fuses two worlds: the Granite of the 20th century (Classical Heritage) and the Ether of the 21st (Digital Assets & Archives).
          </p>
        </section>

        {/* Capability Demonstration */}
        <section className="space-y-6 pt-12 border-t border-zinc-300/60">
          <h2 className="text-xs uppercase tracking-[0.3em] text-zinc-500 font-mono">
            Capability Demonstration
          </h2>
          <div className="p-8 border border-zinc-300 bg-white/60 rounded-3xl space-y-3 shadow-sm">
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Case Study: The White Absolute</p>
            <p className="text-xl font-serif text-[#111111]">Asset: Lucio Fontana (1968) // Valuation &amp; Arbitrage</p>
            <p className="text-base text-zinc-600 font-serif leading-relaxed pt-2">
              See how the Curator Engine analyzes liquidity, risk, and market arbitrage for institutional-grade assets. This is the level of depth I bring to every acquisition.
            </p>
          </div>
        </section>

        {/* The Protocol */}
        <section className="space-y-12 pt-12 border-t border-zinc-300/60">
          <h2 className="text-xs uppercase tracking-[0.3em] text-zinc-500 font-mono">
            The Protocol
          </h2>

          <div className="space-y-12">
            <div className="space-y-3 group">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">01</span>
              <h3 className="text-2xl font-serif font-normal text-[#111111]">The Audit (Digital Hygiene)</h3>
              <p className="text-zinc-600 font-serif text-base leading-relaxed">
                You are vulnerable. I clean your digital footprint, remove the noise, and secure your perimeter. Before we build, we must clear the ground.
              </p>
            </div>

            <div className="space-y-3 group">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">02</span>
              <h3 className="text-2xl font-serif font-normal text-[#111111]">The Acquisition (Selection)</h3>
              <p className="text-zinc-600 font-serif text-base leading-relaxed">
                Curating assets that survive entropy. From post-war modernism to the algorithmic avant-garde. No fillers. Only signals.
              </p>
            </div>

            <div className="space-y-3 group">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">03</span>
              <h3 className="text-2xl font-serif font-normal text-[#111111]">The Archive (Immortality)</h3>
              <p className="text-zinc-600 font-serif text-base leading-relaxed">
                Building your personal Digital Vatican. A system to preserve your collection, your name, and your intent forever. Data is the new marble.
              </p>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <footer className="pt-16 border-t border-zinc-300/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">
            Response time: Within 24 hours
          </p>
          <Link 
            href="mailto:contact@merkurov.love"
            className="group inline-flex items-center gap-4 border-b-2 border-zinc-900 pb-1.5 hover:border-zinc-500 transition-all duration-300"
          >
            <span className="font-mono text-xs uppercase tracking-[0.25em] font-semibold text-[#111111] group-hover:text-zinc-600 transition-colors">Start a conversation</span>
            <ArrowRight size={16} className="group-hover:translate-x-1.5 transition-transform duration-300 text-[#111111] group-hover:text-zinc-600" />
          </Link>
        </footer>

      </div>
    </main>
  );
}
