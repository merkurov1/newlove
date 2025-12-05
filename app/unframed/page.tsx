"use client";

import React, { useState } from 'react';
import { Terminal, Volume2, ArrowDown, Hash, Globe, FileText, Lock } from 'lucide-react';
import Image from 'next/image';
import { Inter, Space_Mono, Playfair_Display } from 'next/font/google';

// --- FONTS ---
const sans = Inter({ subsets: ['latin'], variable: '--font-sans' });
const mono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-mono' });
const serif = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' });

// --- ASSETS ---
const ASSETS = {
  HERO_BG: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1055.png',
  SYSTEM_MAP: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1054.png',
  TIGER: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg',
  AUDIO: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Digitize_the_Death_Mask_Encrypt_Freedom_Never.m4a',
};

// --- DATA ---
const TIMELINE = [
  { 
    year: '1984', 
    title: 'THE FLOOR', 
    text: 'I am four years old. The sun cuts through the tall Stalinist windows. I am drawing. For a brief moment, the chaotic energy of the Soviet intelligentsia aligns into harmony around a boy with a pencil.' 
  },
  { 
    year: '1998', 
    title: 'THE ROOFTOPS', 
    text: 'We drilled through walls built to withstand Nazi artillery. Minus 20 degrees Celsius. Balancing on the edge of seven-story buildings, running coaxial cables with frozen hands.' 
  },
  { 
    year: '2008', 
    title: 'THE SPECTRAL TIGER', 
    text: 'While the global economy collapsed, the price of a virtual tiger in World of Warcraft held steady. I realized then: Digital value doesn’t need banks. It only needs Consensus.', 
    img: ASSETS.TIGER 
  },
  { 
    year: '2017', 
    title: 'THE SOURCE CODE', 
    text: 'We took the original death mask of Vladimir Lenin and scanned it with lasers. We turned the idol into a file. The heavy stone of the Soviet legacy was dematerialized and sold as an NFT.' 
  },
  { 
    year: '2022', 
    title: 'THE SILENCE', 
    text: "February 24th. The names of the 'enemy' were embedded in the granite geography of Moscow. I expected rage. Instead, I saw a city that adjusted its headphones and kept walking.", 
    img: ASSETS.HERO_BG 
  },
  { 
    year: '2025', 
    title: 'THE CANVAS', 
    text: 'The loop closed. I shut the door on the noise. I picked up the stylus. No more strategies, no more signals. Just the discipline of the artist. I am finally awake.', 
    isLast: true 
  },
];

// --- COMPONENTS ---

// 1. REDACTED COMPONENT (Interactive "Whiteout")
const Redacted = ({ children }: { children: React.ReactNode }) => (
  <span className="group relative inline-block cursor-help mx-1 align-bottom">
    {/* Hidden text revealed on hover */}
    <span className="relative z-10 text-transparent transition-all duration-300 group-hover:text-red-600 font-bold select-none group-hover:select-auto">
      {children}
    </span>
    {/* The "Correction Tape" Block */}
    <span className="absolute inset-0 bg-zinc-200 group-hover:bg-transparent transition-colors duration-300" />
  </span>
);

// 2. TIMELINE SLIDE (Glass Card)
const TimelineSlide = ({ item, index }: any) => {
  return (
    <div className="sticky top-0 h-screen w-full flex items-center justify-center">
      {/* Container: Glassmorphism over the fixed title */}
      <div className="relative w-full h-[85vh] md:h-[70vh] bg-black/80 backdrop-blur-md border-y border-white/10 flex items-center justify-center shadow-2xl">
        <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-24 items-center px-6">
          
          {/* LEFT: YEAR & TITLE */}
          <div className="relative">
            <h2 className="text-[12vw] leading-none font-black text-transparent bg-clip-text bg-gradient-to-b from-white/20 to-transparent absolute -left-6 -top-16 select-none z-0 font-sans pointer-events-none">
              {item.year}
            </h2>
            <div className="relative z-10 pl-6 border-l-2 border-red-600">
              <span className="font-mono text-xs text-red-500 tracking-[0.4em] uppercase block mb-4">
                Log Entry {item.year}
              </span>
              <h3 className="text-5xl md:text-7xl font-bold text-white uppercase tracking-tighter leading-[0.9] font-sans">
                {item.title}
              </h3>
            </div>
          </div>

          {/* RIGHT: TEXT & IMAGE */}
          <div className="relative z-10">
            <p className="text-xl md:text-3xl font-serif text-zinc-300 leading-relaxed drop-shadow-md">
              {item.text}
            </p>
            {item.img && (
              <div className="mt-8 relative w-full aspect-video border border-zinc-500/30 overflow-hidden group">
                <Image 
                  src={item.img} 
                  alt="Evidence" 
                  fill 
                  className="object-cover group-hover:scale-105 transition-transform duration-1000 grayscale hover:grayscale-0" 
                />
                <div className="absolute inset-0 bg-black/20 mix-blend-overlay" />
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default function UnframedPage() {
  const [status, setStatus] = useState('idle');
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1500);
  };

  return (
    <div className={`min-h-screen bg-[#050505] text-white selection:bg-red-600 selection:text-white font-sans overflow-x-hidden ${sans.variable} ${mono.variable} ${serif.variable}`}>
      
      {/* 1. GLOBAL FILM GRAIN */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.04] mix-blend-overlay" 
           style={{ backgroundImage: `url("https://grainy-gradients.vercel.app/noise.svg")` }} />

      {/* 2. FIXED BACKGROUND TITLE (The Anchor) */}
      <div className="fixed inset-0 flex flex-col items-center justify-center z-0 pointer-events-none">
        <h1 className="text-[15vw] font-black uppercase tracking-tighter leading-none text-white mix-blend-difference opacity-30 font-sans blur-[1px]">
          UNFRAMED
        </h1>
        <div className="flex items-center gap-4 mt-4 opacity-50 mix-blend-difference">
           <div className="h-[1px] w-12 bg-white" />
           <p className="font-mono text-sm uppercase tracking-[0.3em] text-white">A Memoir by Anton Merkurov</p>
           <div className="h-[1px] w-12 bg-white" />
        </div>
      </div>

      {/* 3. MANIFESTO (THE HOOK) */}
      <section className="min-h-screen flex items-center justify-center px-6 relative z-10">
         <div className="max-w-4xl text-center pt-20">
            <p className="text-3xl md:text-5xl font-serif text-zinc-100 leading-tight drop-shadow-2xl">
              "I spent forty years running away from the boy on the floor. 
              <br/><br/>
              <span className="text-zinc-400 text-2xl md:text-4xl block my-12 leading-normal">
                <Redacted>The System</Redacted> demanded <Redacted>noise</Redacted>. I gave it <Redacted>noise</Redacted>.
              </span>
              But the granite eventually cracks.
              UNFRAMED is the story of closing the loop. Of returning to the only thing that matters: The Line."
            </p>
            <div className="mt-32 animate-bounce flex justify-center text-zinc-500">
               <ArrowDown />
            </div>
         </div>
      </section>

      {/* 4. THE STACK (TIMELINE) */}
      <main className="relative z-10">
        {TIMELINE.map((item, i) => (
          <TimelineSlide 
            key={i} 
            item={item} 
            index={i} 
          />
        ))}
      </main>

      {/* 5. THE ASSET (SOLID FOOTER) */}
      <div className="relative z-20 bg-[#050505] border-t border-zinc-900 shadow-[0_-50px_100px_rgba(0,0,0,1)]">
        
        {/* ANALYSIS */}
        <section className="py-32 px-6">
           <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16">
              
              {/* Visual Map */}
              <div className="border border-zinc-800 p-2 bg-zinc-900/30 group">
                 <div className="relative aspect-square overflow-hidden grayscale invert hover:grayscale-0 hover:invert-0 transition-all duration-700">
                    <Image src={ASSETS.SYSTEM_MAP} alt="Map" fill className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-60" />
                    <div className="absolute bottom-6 left-6 font-mono text-xs text-red-500 uppercase tracking-widest border border-red-500 px-2 py-1 bg-black">
                      Fig. 01: System Failure
                    </div>
                 </div>
              </div>

              {/* Audio */}
              <div className="flex flex-col justify-center">
                 <div className="flex items-center gap-3 mb-8 text-red-600 font-mono text-xs uppercase tracking-[0.2em]">
                    <Volume2 size={16} /> NotebookLM Audio Log
                 </div>
                 <h3 className="text-6xl font-bold mb-8 uppercase font-sans tracking-tighter text-white">
                   Autopsy of <br/> an Empire
                 </h3>
                 <p className="text-zinc-400 font-serif text-xl mb-12 leading-relaxed border-l-2 border-zinc-800 pl-6">
                   "Two synthetic intelligences deconstruct the manuscript, analyzing the shift from the heavy Granite of the Soviet past to the weightless Ether of the digital present."
                 </p>
                 <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-sm">
                    <audio controls className="w-full invert opacity-60 hover:opacity-100 transition-opacity">
                      <source src={ASSETS.AUDIO} type="audio/mp4" />
                    </audio>
                 </div>
              </div>
           </div>
        </section>

        {/* --- THE AGENT BAIT (Specs & Progress) --- */}
        <section className="max-w-7xl mx-auto px-6 mb-24">
           {/* Progress Bar */}
           <div className="w-full h-[2px] bg-zinc-800 mb-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 h-full w-[75%] bg-red-600 shadow-[0_0_20px_red]" />
           </div>
           <div className="flex justify-between items-center font-mono text-xs text-red-600 uppercase tracking-widest mb-12">
              <span>System Status: Uploading</span>
              <span className="animate-pulse">75% Complete</span>
           </div>

           {/* Data Grid */}
           <div className="grid grid-cols-2 md:grid-cols-4 border border-zinc-800 bg-zinc-900/20">
              <div className="p-6 border-r border-b md:border-b-0 border-zinc-800">
                 <Hash size={16} className="text-zinc-500 mb-4" />
                 <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Length</p>
                 <p className="text-white font-mono text-lg">~60k Words</p>
              </div>
              <div className="p-6 border-r border-b md:border-b-0 border-zinc-800">
                 <FileText size={16} className="text-zinc-500 mb-4" />
                 <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Genre</p>
                 <p className="text-white font-mono text-lg">Memoir / Noir</p>
              </div>
              <div className="p-6 border-r border-zinc-800">
                 <Globe size={16} className="text-zinc-500 mb-4" />
                 <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Rights</p>
                 <p className="text-white font-mono text-lg">Available</p>
              </div>
              <div className="p-6">
                 <Lock size={16} className="text-zinc-500 mb-4" />
                 <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Status</p>
                 <p className="text-white font-mono text-lg">Proposal</p>
              </div>
           </div>
        </section>

        {/* TERMINAL FORM */}
        <section className="pb-40 px-6 flex justify-center">
           <div className="max-w-2xl w-full border border-zinc-800 p-12 bg-black">
              <div className="flex items-center gap-2 mb-12 text-zinc-500 font-mono text-xs uppercase tracking-widest border-b border-zinc-800 pb-4">
                 <Terminal size={14} /> Encrypted Channel
              </div>
              
              <h2 className="text-5xl font-black uppercase mb-4 tracking-tighter text-white font-sans">Request Proposal</h2>
              <p className="font-serif text-zinc-500 text-lg mb-12">
                Access restricted to authorized agents & publishers.
              </p>

              {status === 'success' ? (
                <div className="bg-green-900/10 border border-green-900/50 p-8 text-green-500 font-mono text-sm">
                  {'>'} TRANSMISSION SUCCESSFUL.<br/>{'>'} WE WILL ESTABLISH CONTACT.
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="group">
                    <input type="text" className="w-full bg-black border-b border-zinc-800 py-4 text-white font-mono text-lg focus:outline-none focus:border-red-600 transition-colors uppercase placeholder-zinc-800" placeholder="AGENT NAME" required />
                  </div>
                  <div className="group">
                    <input type="text" className="w-full bg-black border-b border-zinc-800 py-4 text-white font-mono text-lg focus:outline-none focus:border-red-600 transition-colors uppercase placeholder-zinc-800" placeholder="AGENCY / HOUSE" required />
                  </div>
                  <div className="group">
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-black border-b border-zinc-800 py-4 text-white font-mono text-lg focus:outline-none focus:border-red-600 transition-colors uppercase placeholder-zinc-800" 
                      placeholder="SECURE EMAIL" 
                      required 
                    />
                  </div>
                  <button className="w-full bg-white text-black font-bold uppercase tracking-[0.2em] py-5 hover:bg-red-600 hover:text-white transition-colors mt-8 font-mono text-xs">
                    Initialize Request
                  </button>
                </form>
              )}
           </div>
        </section>

        {/* SAFE FOOTER */}
        <footer className="py-12 text-center text-zinc-800 font-mono text-[10px] uppercase tracking-widest border-t border-zinc-900/50 flex flex-col gap-2 bg-black">
          <span>Anton Merkurov / Unframed © 2025</span>
          <span>Moscow • London • Moscow • Ether</span>
        </footer>

      </div>
    </div>
  );
}