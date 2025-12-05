"use client";

import React, { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
const DynamicGlitchCanvas = dynamic(() => import('@/components/unframed/GlitchCanvas'), { ssr: false, loading: () => null });
import { ErrorBoundaryWrapper as ErrorBoundary } from '@/components/unframed/ErrorBoundary';
import { motion } from 'framer-motion';
// Import a single icon component for the timeline entry. If this causes SSR issues we can switch to a client-only dynamic import.
import { MicOff } from 'lucide-react';

import Image from 'next/image';

// --- ASSETS ---
const ASSETS = {
  HERO_BG: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1055.png",
  SYSTEM_MAP: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1054.png",
  TIGER: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg",
  AUDIO: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Digitize_the_Death_Mask_Encrypt_Freedom_Never.m4a"
};

// --- COMPONENTS ---

// GlitchCanvas is loaded dynamically (client-only) via DynamicGlitchCanvas

// 2. TIMELINE ITEM
const TimelineItem = ({ year, title, text, icon, image }: any) => (
  <motion.div 
    initial={{ opacity: 0, x: -20 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true, margin: "-100px" }}
    className="relative pl-8 md:pl-12 py-10 border-l border-zinc-800"
  >
    <div className="absolute -left-[9px] top-11 w-4 h-4 bg-black border-2 border-red-600 rounded-full" />
    <div className="flex items-center gap-3 mb-2">
      <span className="font-mono text-red-500 font-bold text-xl">{year}</span>
      {icon && (
        typeof icon === 'string' ? (
          <span className="text-zinc-500 text-lg">{icon}</span>
        ) : (
          React.createElement(icon as any, { size: 18, className: 'text-zinc-500' })
        )
      )}
    </div>
    <h3 className="text-xl md:text-2xl font-bold text-white mb-3 uppercase tracking-wider">{title}</h3>
    <p className="text-zinc-400 font-serif leading-relaxed text-lg max-w-2xl mb-4">
      {text}
    </p>
    {image && (
      <div className="relative w-full max-w-md h-64 overflow-hidden rounded-sm border border-zinc-800 mt-4 grayscale hover:grayscale-0 transition-all duration-500 group">
        <Image src={image} alt={title} fill className="object-cover group-hover:scale-105 transition-transform duration-700" />
      </div>
    )}
  </motion.div>
);

export default function UnframedPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  // Debug: log render
  if (typeof window !== 'undefined') console.debug('UnframedPage rendered');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    // Simulation
    setTimeout(() => setStatus('success'), 1500);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-red-600 selection:text-white overflow-x-hidden">
      {/* GLOBAL FILM GRAIN */}
      <div aria-hidden className="fixed inset-0 pointer-events-none z-50 opacity-40" style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><filter id='f'><feTurbulence baseFrequency='0.9' numOctaves='1' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23f)' opacity='0.06' fill='black'/></svg>")`, backgroundSize: 'cover' }} />

      {/* MARQUEE STATUS (Brutalist) */}
      <div className="w-full border-b border-zinc-800 bg-black/20">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-red-500 py-2">SYSTEM STATUS: CRITICAL // MANUSCRIPT UPLOADED // BREACH DETECTED //</div>
      </div>

      {/* MAIN GRID LAYOUT (Dossier) */}
      <main className="max-w-[1200px] mx-auto border-y border-zinc-800">
        {/* HERO / TITLE */}
        <section className="grid grid-cols-12 items-center border-b border-zinc-800">
          <div className="col-span-2 border-r border-zinc-800 p-6">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">ARCHIVE</div>
          </div>
          <div className="col-span-10 p-8">
            <h1 className="text-[15vw] leading-[0.8] font-black uppercase tracking-tighter text-white">UNFRAMED</h1>
            <div className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 border-t border-zinc-800 pt-3">The Granite. The Glitch. The Noir.</div>
          </div>
        </section>

        {/* MANIFESTO / PREMISE */}
        <section className="grid grid-cols-12 border-b border-zinc-800">
          <div className="col-span-3 border-r border-zinc-800 p-6">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">01 / The Premise</div>
          </div>
          <div className="col-span-9 p-8">
            <p className="text-2xl font-serif text-zinc-200 leading-tight border-l border-zinc-800 pl-6">"This is not a story about politics. It is an autopsy of an illusion. Born to guard the granite of the Soviet Empire. We believed that data was the new marble."</p>
          </div>
        </section>

        {/* TIMELINE / DOSSIER */}
        <section className="grid grid-cols-12 border-b border-zinc-800">
          <div className="col-span-3 border-r border-zinc-800 p-6">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">02 / The Trajectory</div>
          </div>
          <div className="col-span-9 p-0">
            <div className="w-full">
              {/** Timeline header row */}
              <div className="grid grid-cols-12 text-xs font-mono uppercase tracking-[0.2em] border-b border-zinc-800">
                <div className="col-span-2 p-3 border-r border-zinc-800">Year</div>
                <div className="col-span-10 p-3">Record</div>
              </div>

              {/** Items rendered as table rows */}
              <div className="divide-y divide-zinc-800">
                <div className="grid grid-cols-12 items-start py-6">
                  <div className="col-span-2 p-6 font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 border-r border-zinc-800">1984</div>
                  <div className="col-span-10 p-6">
                    <div className="font-bold text-lg uppercase">The Floor</div>
                    <div className="text-zinc-400 mt-2">I am four years old. The sun cuts through the tall Stalinist windows. I am drawing.</div>
                  </div>
                </div>

                <div className="grid grid-cols-12 items-start py-6">
                  <div className="col-span-2 p-6 font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 border-r border-zinc-800">1998</div>
                  <div className="col-span-10 p-6">
                    <div className="font-bold text-lg uppercase">The Rooftops</div>
                    <div className="text-zinc-400 mt-2">Balancing on the edge of seven-story buildings, running coaxial cables with frozen hands.</div>
                  </div>
                </div>

                <div className="grid grid-cols-12 items-start py-6">
                  <div className="col-span-2 p-6 font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 border-r border-zinc-800">2003</div>
                  <div className="col-span-10 p-6">
                    <div className="font-bold text-lg uppercase">The Glass Cage</div>
                    <div className="text-zinc-400 mt-2">Walking past the Khodorkovsky trial daily. A public flogging broadcast on all frequencies.</div>
                  </div>
                </div>

                <div className="grid grid-cols-12 items-start py-6">
                  <div className="col-span-2 p-6 font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 border-r border-zinc-800">2008</div>
                  <div className="col-span-10 p-6 flex items-center gap-6">
                    <div className="w-48 h-36 grayscale group-hover:grayscale-0 overflow-hidden border border-zinc-800">
                      <Image src={ASSETS.TIGER} alt="Tiger" fill className="object-cover" />
                    </div>
                    <div>
                      <div className="font-bold text-lg uppercase">The Spectral Tiger</div>
                      <div className="text-zinc-400 mt-2">Digital value doesn’t need banks. It only needs Consensus.</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-12 items-start py-6">
                  <div className="col-span-2 p-6 font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 border-r border-zinc-800">2017</div>
                  <div className="col-span-10 p-6">
                    <div className="font-bold text-lg uppercase">The Source Code</div>
                    <div className="text-zinc-400 mt-2">We took the original death mask and scanned it with lasers. The idol became a file.</div>
                  </div>
                </div>

                <div className="grid grid-cols-12 items-start py-6">
                  <div className="col-span-2 p-6 font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 border-r border-zinc-800">2022</div>
                  <div className="col-span-10 p-6">
                    <div className="font-bold text-lg uppercase">The Silence</div>
                    <div className="text-zinc-400 mt-2">February 24th. I walked past Kievsky Railway Station and Ukrainian Boulevard. The names of the 'enemy' were embedded in the granite geography of Moscow. The silence was louder than the explosions.</div>
                  </div>
                </div>

                <div className="grid grid-cols-12 items-start py-6">
                  <div className="col-span-2 p-6 font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 border-r border-zinc-800">2024</div>
                  <div className="col-span-10 p-6">
                    <div className="font-bold text-lg uppercase">The Departure</div>
                    <div className="text-zinc-400 mt-2">I crossed the border at night, wearing a surgical mask, leaving the Granite behind.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ANALYSIS */}
        <section className="grid grid-cols-12 border-b border-zinc-800">
          <div className="col-span-3 border-r border-zinc-800 p-6">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">03 / System Analysis</div>
          </div>
          <div className="col-span-9 p-6">
            <div className="border-l border-zinc-800 pl-6 text-zinc-400 font-mono text-xs uppercase tracking-[0.2em]">AI GENERATED INSIGHTS</div>
            <div className="mt-4 grid md:grid-cols-2 gap-6">
              <div className="bg-black border border-zinc-800 p-6">The Autopsy of an Empire — NotebookLM</div>
              <div className="bg-black border border-zinc-800 p-6">System Architecture visualized as collapse maps.</div>
            </div>
          </div>
        </section>

        {/* FORM: Terminal style */}
        <section className="grid grid-cols-12 py-12">
          <div className="col-span-3 border-r border-zinc-800 p-6">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">REQUEST</div>
          </div>
          <div className="col-span-9 p-6">
            <form onSubmit={handleSubmit} className="bg-black border border-zinc-800 p-4">
              <div className="flex gap-2 items-center">
                <span className="font-mono text-xs text-red-500">λ</span>
                <input className="flex-1 bg-black text-white border border-zinc-700 p-3 font-mono text-sm rounded-none outline-none" placeholder="NAME" />
                <input className="w-64 bg-black text-white border border-zinc-700 p-3 font-mono text-sm rounded-none outline-none" placeholder="EMAIL" />
                <button type="submit" className="ml-2 bg-red-600 text-black font-bold px-4 py-3 rounded-none">TRANSMIT</button>
              </div>
              <div className="mt-3 font-mono text-[11px] text-zinc-500">Tip: submissions require authorization token.</div>
            </form>
          </div>
        </section>
      </main>

      <footer className="w-full border-t border-zinc-800 text-center py-6 font-mono text-xs text-zinc-600">MERKUROV.LOVE / UNFRAMED © 2025 — BELGRADE • LONDON • ETHER</footer>
    </div>
  );
}