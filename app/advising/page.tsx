'use client';

import React from 'react';
import Link from 'next/link';

export default function AdvisingPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-20 md:py-32 selection:bg-white selection:text-black">
      <div className="max-w-2xl mx-auto space-y-16">
        
        {/* Header */}
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 font-mono">
            The Private Office // Anton Merkurov
          </p>
          <h1 className="text-3xl md:text-5xl font-light tracking-tight">
            Heritage Architecture for the Post-Digital Age.
          </h1>
          <p className="text-lg text-neutral-400 font-light">
            Art Advisory, Legacy Structures, and Digital Sovereignty.
          </p>
        </header>

        {/* Manifesto */}
        <section className="space-y-6 text-neutral-300 font-light leading-relaxed">
          <p>
            The art world is full of noise. Galleries sell inventory. Algorithms manipulate taste. Auctions are theatre.
          </p>
          <p className="text-xl text-white font-normal">
            I offer silence.
          </p>
          <p>
            I do not just &quot;buy art&quot; for you. I build Legacy Structures for individuals who plan in decades, not quarters. 
            My approach fuses two worlds: the Granite of the 20th century (Classical Heritage) and the Ether of the 21st (Digital Assets & Archives).
          </p>
        </section>

        {/* Capability Demonstration */}
        <section className="space-y-4 pt-6 pb-2 border-t border-neutral-900">
          <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-500 font-mono">
            Capability Demonstration
          </h2>
          <div className="p-6 border border-neutral-800 bg-neutral-950 space-y-3">
            <p className="text-sm text-neutral-400 font-mono">Case Study: The White Absolute</p>
            <p className="text-white font-medium">Asset: Lucio Fontana (1968) // Valuation & Arbitrage</p>
            <p className="text-sm text-neutral-400 font-light">
              See how the Curator Engine analyzes liquidity, risk, and market arbitrage for institutional-grade assets. This is the level of depth I bring to every acquisition.
            </p>
          </div>
        </section>

        {/* The Protocol */}
        <section className="space-y-8 pt-8 border-t border-neutral-900">
          <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-500 font-mono">
            The Protocol
          </h2>

          <div className="space-y-8">
            <div className="space-y-2">
              <span className="text-xs font-mono text-neutral-600">01</span>
              <h3 className="text-xl font-normal text-white">The Audit (Digital Hygiene)</h3>
              <p className="text-neutral-400 font-light">
                You are vulnerable. I clean your digital footprint, remove the noise, and secure your perimeter. Before we build, we must clear the ground.
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-mono text-neutral-600">02</span>
              <h3 className="text-xl font-normal text-white">The Acquisition (Selection)</h3>
              <p className="text-neutral-400 font-light">
                Curating assets that survive entropy. From post-war modernism to the algorithmic avant-garde. No fillers. Only signals.
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-mono text-neutral-600">03</span>
              <h3 className="text-xl font-normal text-white">The Archive (Immortality)</h3>
              <p className="text-neutral-400 font-light">
                Building your personal Digital Vatican. A system to preserve your collection, your name, and your intent forever. Data is the new marble.
              </p>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <footer className="pt-12 border-t border-neutral-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <p className="text-sm text-neutral-500 font-light">
            Response time: Within 24 hours
          </p>
          <Link 
            href="mailto:contact@merkurov.love"
            className="inline-flex items-center space-x-2 text-sm uppercase tracking-wider text-white border-b border-white pb-1 hover:text-neutral-400 hover:border-neutral-400 transition-colors"
          >
            <span>Start a conversation</span>
            <span>→</span>
          </Link>
        </footer>

      </div>
    </main>
  );
}
