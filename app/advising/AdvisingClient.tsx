'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/Header';
import { ArrowRight, ShieldCheck, Compass, Eye, Sparkles } from 'lucide-react';

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

      <div className="max-w-5xl mx-auto px-6 md:px-12 pt-32 md:pt-40 pb-32 relative z-20 space-y-24">
        
        {/* HERO & EDITORIAL PORTRAIT SECTION */}
        <header className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-end border-b border-zinc-300/60 pb-16">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-300 bg-white/50 text-xs font-mono uppercase tracking-widest text-zinc-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              Strategic Advisory &amp; Private Counsel
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-normal tracking-tight text-[#111111] leading-[1.08]">
              At the Intersection of Technology, Culture, and Capital.
            </h1>
            
            <p className="text-xl md:text-2xl text-zinc-600 font-serif leading-relaxed pt-2">
              Direct peer-to-peer counsel for high-stakes environments. No slide decks, no institutional bias, zero corporate fluff.
            </p>
          </div>

          {/* TV Interview Screenshot / Portrait */}
          <div className="lg:col-span-5 relative group">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-300/80 bg-zinc-200 shadow-xl transition-all duration-500 group-hover:shadow-2xl">
              <img
                src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Advising/IMG_1526.jpeg"
                alt="Anton Merkurov - German TV Interview Screenshot"
                className="w-full h-full object-cover grayscale contrast-105 group-hover:grayscale-0 transition-all duration-700 ease-out scale-[1.02] group-hover:scale-100"
              />
              <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-2xl pointer-events-none" />
            </div>
            <div className="flex justify-between items-center pt-3 text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
              <span>Broadcasting / International Media</span>
              <span>Off-the-Record Counsel</span>
            </div>
          </div>
        </header>

        {/* MANIFESTO / THE CORE PREMISE */}
        <section className="max-w-3xl space-y-8 font-serif text-xl md:text-2xl leading-relaxed text-zinc-800">
          <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">The Premise</p>
          <p className="text-[#111111] font-normal leading-snug">
            Most experts live in silos: corporate lawyers don&apos;t grasp fine art, gallery directors fear AI regulation, and venture funds drown in hype.
          </p>
          <p className="text-zinc-600 text-lg md:text-xl leading-relaxed">
            I operate at the convergence. I bring a helicopter view to complex, unconventional challenges where law, emerging tech, media, and cultural capital collide.
          </p>
        </section>

        {/* THREE PILLARS OF CAPABILITY */}
        <section className="space-y-12 pt-12 border-t border-zinc-300/60">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Domains of Expertise</p>
              <h2 className="text-3xl md:text-4xl font-serif text-[#111111] mt-1">Cross-Domain Capability</h2>
            </div>
            <p className="text-sm font-mono text-zinc-500 max-w-xs">
              Anticipating structural shifts before they reach boardroom consensus.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Pillar 1 */}
            <div className="p-8 border border-zinc-300/70 bg-white/40 rounded-3xl space-y-4 hover:border-zinc-400 hover:bg-white/80 transition-all duration-300 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-300 flex items-center justify-center text-zinc-800">
                  <Compass size={20} />
                </div>
                <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">01 / Regulatory &amp; Tech</span>
                <h3 className="text-2xl font-serif text-[#111111]">Horizon Navigation</h3>
                <p className="text-zinc-600 font-serif text-base leading-relaxed">
                  Tech waves come and go — from early crypto to AI policy. I focus on the structural aftermath: how emerging tech breaks current frameworks, alters media, and reshapes institutional rules.
                </p>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="p-8 border border-zinc-300/70 bg-white/40 rounded-3xl space-y-4 hover:border-zinc-400 hover:bg-white/80 transition-all duration-300 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-300 flex items-center justify-center text-zinc-800">
                  <Eye size={20} />
                </div>
                <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">02 / Art &amp; Heritage</span>
                <h3 className="text-2xl font-serif text-[#111111]">Cultural Capital</h3>
                <p className="text-zinc-600 font-serif text-base leading-relaxed">
                  Navigating the unwritten mechanics of the art market, historical heritage, and institutional valuation. Independent perspective on acquiring, preserving, and structuring cultural assets.
                </p>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="p-8 border border-zinc-300/70 bg-white/40 rounded-3xl space-y-4 hover:border-zinc-400 hover:bg-white/80 transition-all duration-300 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-300 flex items-center justify-center text-zinc-800">
                  <ShieldCheck size={20} />
                </div>
                <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">03 / Private Counsel</span>
                <h3 className="text-2xl font-serif text-[#111111]">High-Stakes Board</h3>
                <p className="text-zinc-600 font-serif text-base leading-relaxed">
                  Serving as a confidential sounding board for decision-makers. Validating high-risk hypotheses, finding blind spots, and delivering unfiltered clarity in sensitive environments.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* WHO I WORK WITH */}
        <section className="space-y-8 pt-12 border-t border-zinc-300/60">
          <p className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Client Ecosystem</p>
          <h2 className="text-3xl md:text-4xl font-serif text-[#111111]">Designed for High-Consequence Environments</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <div className="p-6 border border-zinc-200 bg-white/30 rounded-2xl space-y-2">
              <h4 className="font-serif text-lg font-medium text-[#111111]">UHNW &amp; Family Offices</h4>
              <p className="text-sm font-serif text-zinc-600 leading-relaxed">
                Confidential advisory on non-standard assets, legacy structuring, and navigating rapid cultural shifts.
              </p>
            </div>
            
            <div className="p-6 border border-zinc-200 bg-white/30 rounded-2xl space-y-2">
              <h4 className="font-serif text-lg font-medium text-[#111111]">Think Tanks &amp; Labs</h4>
              <p className="text-sm font-serif text-zinc-600 leading-relaxed">
                Strategic perspective on the legal, ethical, and societal consequences of emerging technologies.
              </p>
            </div>

            <div className="p-6 border border-zinc-200 bg-white/30 rounded-2xl space-y-2">
              <h4 className="font-serif text-lg font-medium text-[#111111]">Cultural Foundations</h4>
              <p className="text-sm font-serif text-zinc-600 leading-relaxed">
                Advisory at the crossroads of classical heritage preservation, digital archives, and auction mechanics.
              </p>
            </div>
          </div>
        </section>

        {/* OPERATING PRINCIPLES */}
        <section className="space-y-10 pt-12 border-t border-zinc-300/60">
          <div>
            <p className="text-xs font-mono text-zinc-400 uppercase tracking-widest">How I Work</p>
            <h2 className="text-3xl md:text-4xl font-serif text-[#111111] mt-1">Operating Principles</h2>
          </div>

          <div className="space-y-8 max-w-4xl">
            <div className="space-y-2">
              <h3 className="text-xl font-serif text-[#111111] font-medium flex items-center gap-3">
                <span className="font-mono text-xs text-zinc-400">01</span>
                Unfiltered Reality
              </h3>
              <p className="text-zinc-600 font-serif text-base leading-relaxed pl-7">
                You pay for what is actually happening, not for comforting slides. If an initiative is flawed or dead on arrival, I state it immediately with zero corporate politeness.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-serif text-[#111111] font-medium flex items-center gap-3">
                <span className="font-mono text-xs text-zinc-400">02</span>
                Peer-to-Peer Alignment
              </h3>
              <p className="text-zinc-600 font-serif text-base leading-relaxed pl-7">
                Complete cultural fluency with principal-level environments. Direct dialogue on equal footing — free of subservience, posturing, or sanitized consultant speech.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-serif text-[#111111] font-medium flex items-center gap-3">
                <span className="font-mono text-xs text-zinc-400">03</span>
                Uncompromising Personal Trust &amp; Discretion
              </h3>
              <p className="text-zinc-600 font-serif text-base leading-relaxed pl-7">
                High-stakes counsel relies on absolute personal integrity. The kind of trust where assets, sensitive context, and non-public strategy can be left in my hands without a second thought.
              </p>
            </div>
          </div>
        </section>

        {/* ENGAGEMENT FORMATS */}
        <section className="space-y-8 pt-12 border-t border-zinc-300/60">
          <p className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Interaction</p>
          <h2 className="text-3xl font-serif text-[#111111]">Engagement Formats</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 border border-zinc-300/80 bg-white/60 rounded-2xl space-y-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">Retainer</span>
              <h4 className="font-serif text-xl text-[#111111]">Board &amp; Advisory</h4>
              <p className="text-xs font-serif text-zinc-600 leading-relaxed">
                Ongoing strategic presence, horizon scanning, and periodic sanity-checks for funds, labs, and private offices.
              </p>
            </div>

            <div className="p-6 border border-zinc-300/80 bg-white/60 rounded-2xl space-y-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">Targeted</span>
              <h4 className="font-serif text-xl text-[#111111]">Special Projects</h4>
              <p className="text-xs font-serif text-zinc-600 leading-relaxed">
                Direct steering of cross-disciplinary initiatives involving law, art infrastructure, media, and tech.
              </p>
            </div>

            <div className="p-6 border border-zinc-300/80 bg-white/60 rounded-2xl space-y-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">Confidential</span>
              <h4 className="font-serif text-xl text-[#111111]">Private Strategy Sessions</h4>
              <p className="text-xs font-serif text-zinc-600 leading-relaxed">
                Confidential deep-dives for principals facing unique, high-consequence decisions.
              </p>
            </div>
          </div>
        </section>

        {/* FOOTER & CALL TO ACTION */}
        <footer className="pt-16 border-t border-zinc-300/60 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-2">
            <h3 className="text-2xl font-serif text-[#111111]">Direct &amp; Confidential.</h3>
            <p className="text-sm font-serif text-zinc-600">
              If you are facing a problem that doesn&apos;t fit standard consulting boxes, let&apos;s talk.
            </p>
          </div>

          <Link 
            href="mailto:contact@merkurov.love"
            className="group inline-flex items-center gap-4 border-b-2 border-zinc-900 pb-2 hover:border-zinc-500 transition-all duration-300 self-start md:self-auto"
          >
            <span className="font-mono text-xs uppercase tracking-[0.25em] font-semibold text-[#111111] group-hover:text-zinc-600 transition-colors">
              Start a Conversation
            </span>
            <ArrowRight size={16} className="group-hover:translate-x-1.5 transition-transform duration-300 text-[#111111] group-hover:text-zinc-600" />
          </Link>
        </footer>

      </div>
    </main>
  );
}
