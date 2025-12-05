"use client";

import React, { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
const DynamicGlitchCanvas = dynamic(() => import('@/components/unframed/GlitchCanvas'), { ssr: false, loading: () => null });
import { ErrorBoundaryWrapper as ErrorBoundary } from '@/components/unframed/ErrorBoundary';
import { motion } from 'framer-motion';
import { Terminal, Send, Lock, Cpu, Fingerprint, BookOpen, Volume2, Play } from 'lucide-react';
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
const TimelineItem = ({ year, title, text, icon: Icon, image }: any) => (
  <motion.div 
    initial={{ opacity: 0, x: -20 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true, margin: "-100px" }}
    className="relative pl-8 md:pl-12 py-10 border-l border-zinc-800"
  >
    <div className="absolute -left-[9px] top-11 w-4 h-4 bg-black border-2 border-red-600 rounded-full" />
    <div className="flex items-center gap-3 mb-2">
      <span className="font-mono text-red-500 font-bold text-xl">{year}</span>
      {Icon && <Icon size={18} className="text-zinc-500" />}
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
    <div className="min-h-screen bg-black text-white selection:bg-red-900 selection:text-white overflow-x-hidden font-sans">
      {/* DEBUG BANNER: remove after verification */}
      <div className="fixed top-4 right-4 z-50 bg-red-600 text-white px-3 py-1 rounded shadow">DEBUG: PAGE LOADED</div>
      
      {/* --- HERO SECTION --- */}
      <section className="h-screen w-full relative flex flex-col justify-center items-center overflow-hidden">
        {/* Background Image Layer */}
        <div className="absolute inset-0 z-0">
          <Image 
            src={ASSETS.HERO_BG} 
            alt="Granite Glitch" 
            fill 
            className="object-cover opacity-40 mix-blend-luminosity"
            priority
          />
          <div className="absolute inset-0 bg-black/70" />
        </div>

        {/* 3D Layer (dynamically loaded client component) */}
        <div className="absolute inset-0 z-10 opacity-60 pointer-events-none">
          <ErrorBoundary>
            <Suspense fallback={null}>
              <DynamicGlitchCanvas />
            </Suspense>
          </ErrorBoundary>
        </div>
        
        <div className="z-20 text-center px-4 mix-blend-difference">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-6xl md:text-9xl font-black tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-600">
              UNFRAMED
            </h1>
            <p className="text-sm md:text-lg font-mono text-red-500 tracking-[0.2em] uppercase mb-8">
              The Granite. The Glitch. The Ghost.
            </p>
            <div className="inline-flex items-center gap-2 border border-zinc-800 bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-mono text-zinc-400">MANUSCRIPT AVAILABLE FOR ACQUISITION</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* --- MANIFESTO --- */}
      <section className="py-24 px-6 md:px-20 max-w-5xl mx-auto border-t border-zinc-900">
        <h2 className="text-zinc-500 font-mono text-sm mb-8 uppercase">01 / The Premise</h2>
        <p className="text-2xl md:text-4xl font-serif leading-tight text-zinc-200">
          "This is not a story about politics. It is an autopsy of an illusion. <br/><br/>
          <span className="text-zinc-500">
            Born to guard the granite of the Soviet Empire, I spent forty years trying to upload it to the cloud. 
            We believed that data was the new marble. We were wrong.
          </span>
        </p>
      </section>

      {/* --- TIMELINE --- */}
      <section className="py-24 px-6 md:px-20 max-w-4xl mx-auto">
         <h2 className="text-zinc-500 font-mono text-sm mb-12 uppercase">02 / The Trajectory</h2>
         
         <div className="border-l border-zinc-900 pl-0">
            <TimelineItem 
              year="1984" 
              title="The Floor" 
              text="I am four years old. I am lying on the warm parquet floor. The sun cuts through the tall Stalinist windows. I am drawing. For a brief moment, the chaotic energy of the Soviet intelligentsia aligns into harmony around a boy with a pencil."
              icon={BookOpen}
            />
            <TimelineItem 
              year="1998" 
              title="The Rooftops" 
              text="We drilled through walls built to withstand Nazi artillery. Minus 20 degrees Celsius. Balancing on the edge of seven-story buildings, running coaxial cables with frozen hands. We weren’t just connecting apartments; we were building the physical infrastructure of freedom."
              icon={Cpu}
            />
             <TimelineItem 
              year="2003" 
              title="The Glass Cage" 
              text="Walking past the Khodorkovsky trial daily. Inside, the richest man in the country sat in a cage. Outside, the city pretended nothing was happening. It was a public flogging broadcast on all frequencies."
              icon={Lock}
            />
            <TimelineItem 
              year="2008" 
              title="The Spectral Tiger" 
              text="While the global economy collapsed, the price of a virtual tiger in World of Warcraft held steady. I realized then: Digital value doesn’t need banks. It only needs Consensus."
              icon={Terminal}
              image={ASSETS.TIGER} 
            />
             <TimelineItem 
              year="2017" 
              title="The Source Code" 
              text="We took the original death mask of Vladimir Lenin and scanned it with lasers. We turned the idol into a file. The heavy stone of the Soviet legacy was dematerialized and sold as an NFT."
              icon={Fingerprint}
            />
            <TimelineItem 
              year="2022" 
              title="The Smile" 
              text="I was lying in a dentist’s chair, getting expensive Hollywood veneers installed, while Russian tanks rolled across the border. I walked out onto Kutuzovsky Prospect with a blindingly white smile, facing a city that had just bitten its own tongue off."
              icon={Volume2}
            />
             <TimelineItem 
              year="2024" 
              title="The Departure" 
              text="The loop closed. I didn’t look back at the library or the walls. I crossed the border at night, wearing a surgical mask, leaving the Granite behind. The Ether was ahead."
              icon={Send}
            />
         </div>
      </section>

      {/* --- AI / DATA SECTION --- */}
      <section className="py-24 bg-zinc-900/30 border-y border-zinc-800">
        <div className="max-w-6xl mx-auto px-6">
           <div className="flex items-center justify-between mb-8">
             <h2 className="text-zinc-500 font-mono text-sm uppercase">03 / System Analysis</h2>
             <div className="flex items-center gap-2 text-xs font-mono text-red-500">
               <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
               AI GENERATED INSIGHTS
             </div>
           </div>
           
           <div className="grid md:grid-cols-2 gap-8">
             {/* AUDIO BLOCK */}
             <div className="bg-black border border-zinc-800 p-8 rounded-sm flex flex-col justify-between min-h-[300px]">
                <div>
                    <div className="flex items-center gap-4 mb-4 text-zinc-400">
                    <Volume2 size={24} className="text-red-500" />
                    <span className="font-mono text-sm tracking-wider">NOTEBOOKLM PODCAST</span>
                    </div>
                    <h3 className="font-bold text-2xl mb-2 text-white">The Autopsy of an Empire</h3>
                    <p className="text-sm text-zinc-500 mb-6">Two AI hosts deconstruct the manuscript, analyzing the shift from Granite to Ether.</p>
                </div>
                
                {/* Custom Audio Player Wrapper */}
                <div className="w-full bg-zinc-900 border border-zinc-800 rounded p-4">
                  <audio 
                    controls 
                    className="w-full h-8 invert opacity-80 hover:opacity-100 transition-opacity"
                    style={{ filter: "invert(1) hue-rotate(180deg)" }} 
                  >
                    <source src={ASSETS.AUDIO} type="audio/mp4" />
                    <source src={ASSETS.AUDIO} type="audio/x-m4a" />
                    Your browser does not support the audio element.
                  </audio>
                  <div className="flex justify-between mt-2 font-mono text-[10px] text-zinc-600 uppercase">
                     <span>Status: Online</span>
                     <span>Source: NotebookLM</span>
                  </div>
                </div>
             </div>
             
             {/* VISUAL DATA BLOCK */}
             <div className="relative group overflow-hidden border border-zinc-800 rounded-sm min-h-[300px]">
               <Image 
                 src={ASSETS.SYSTEM_MAP} 
                 alt="System Architecture" 
                 fill 
                 className="object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
               />
               <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-90" />
               <div className="absolute bottom-0 left-0 right-0 p-6">
                  <p className="font-mono text-xs text-red-500 uppercase tracking-widest mb-1">
                    Fig 1. System Architecture
                  </p>
                  <p className="text-zinc-400 text-sm">Visualizing the collapse of the vertical power structure.</p>
               </div>
             </div>
           </div>
        </div>
      </section>

      {/* --- GATE / FORM --- */}
      <section className="py-32 px-6 flex flex-col items-center justify-center bg-zinc-950">
        <div className="max-w-xl w-full text-center">
          <h2 className="text-3xl font-bold mb-2">REQUEST FULL PROPOSAL</h2>
          <p className="text-zinc-500 mb-8 font-serif">Access restricted to authorized agents and publishers.</p>
          
          {status === 'success' ? (
            <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 border border-green-900 bg-green-900/10 text-green-500 font-mono text-sm"
            >
              SIGNAL RECEIVED. <br/> WE WILL ESTABLISH CONNECTION SHORTLY.
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
              <input type="text" className="w-full bg-zinc-900 border border-zinc-800 p-4 text-white focus:outline-none focus:border-red-900 transition-colors placeholder:text-zinc-700 font-mono text-sm" placeholder="NAME" required />
              <input type="text" className="w-full bg-zinc-900 border border-zinc-800 p-4 text-white focus:outline-none focus:border-red-900 transition-colors placeholder:text-zinc-700 font-mono text-sm" placeholder="AGENCY / HOUSE" required />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 p-4 text-white focus:outline-none focus:border-red-900 transition-colors placeholder:text-zinc-700 font-mono text-sm" 
                placeholder="EMAIL" 
                required
              />
              <button 
                type="submit" 
                disabled={status === 'loading'}
                className="bg-white text-black font-bold py-4 hover:bg-zinc-200 transition-colors mt-4 uppercase tracking-widest disabled:opacity-50"
              >
                {status === 'loading' ? 'Transmitting...' : 'Initialize Request'}
              </button>
            </form>
          )}
        </div>
      </section>

      <footer className="py-12 text-center border-t border-zinc-900 text-zinc-600 font-mono text-xs">
        <p>MERKUROV.LOVE / UNFRAMED © 2025</p>
        <p>BELGRADE — LONDON — ETHER</p>
      </footer>
    </div>
  );
}