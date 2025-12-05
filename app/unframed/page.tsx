"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MicOff, PenTool, Maximize2, ArrowRight, Terminal } from 'lucide-react';
import Image from 'next/image';

// --- ASSETS ---
const ASSETS = {
  HERO_BG: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1055.png",
  SYSTEM_MAP: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1054.png",
  TIGER: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg",
  AUDIO: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Digitize_the_Death_Mask_Encrypt_Freedom_Never.m4a"
};

// --- COMPONENTS ---

// 1. REDACTED TEXT (The "Secret" Interaction)
const Redacted = ({ children }: { children: React.ReactNode }) => {
  return (
    <span className="group relative inline-block cursor-help mx-1 align-bottom">
      <span className="relative z-10 bg-zinc-900 text-transparent select-none transition-all duration-300 group-hover:bg-transparent group-hover:text-red-600 group-hover:drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]">
        {children}
      </span>
      <span className="absolute inset-0 bg-zinc-800 animate-pulse group-hover:hidden" />
    </span>
  );
};

// 2. TIMELINE ITEM (Editorial Style)
const TimelineItem = ({ year, title, text, image, isLast }: any) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      className={`relative grid grid-cols-1 md:grid-cols-12 gap-8 py-24 ${!isLast ? 'border-b border-zinc-900' : ''}`}
    >
      {/* Background Giant Year */}
      <div className="absolute -left-10 top-10 text-[12rem] font-black text-zinc-900/50 select-none pointer-events-none z-0 font-mono tracking-tighter leading-none overflow-hidden">
        {year}
      </div>

      {/* Content */}
      <div className="md:col-span-4 z-10 pt-8 pl-4">
        <div className="font-mono text-red-600 text-xs mb-4 tracking-[0.3em] uppercase flex items-center gap-2">
          <div className="w-2 h-2 bg-red-600 rounded-full" />
          Log entry {year}
        </div>
        <h3 className="text-4xl md:text-5xl font-bold text-white mb-6 uppercase tracking-tighter leading-[0.9] font-sans">
          {title}
        </h3>
      </div>

      <div className="md:col-span-6 md:col-start-6 z-10 pt-10">
        <p className="text-xl md:text-2xl font-serif text-zinc-400 leading-relaxed mix-blend-plus-lighter">
          {text}
        </p>
        
        {image && (
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="mt-12 relative w-full aspect-video border border-zinc-800 group overflow-hidden"
          >
            <Image 
              src={image} 
              alt={title} 
              fill 
              className="object-cover grayscale contrast-125 group-hover:grayscale-0 transition-all duration-700" 
            />
            {/* Image Overlay Noise */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none" />
            <div className="absolute bottom-0 left-0 bg-black/80 px-4 py-2 font-mono text-[10px] text-zinc-500 uppercase tracking-widest border-t border-r border-zinc-800">
              Fig. {year}.A
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

// --- MAIN PAGE ---

export default function UnframedPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const scrollRef = useRef(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Simple scroll progress (0..1) for the top progress bar
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const doc = document.documentElement;
        const scrollTop = window.scrollY || doc.scrollTop;
        const height = doc.scrollHeight - window.innerHeight;
        const pct = height > 0 ? Math.min(1, Math.max(0, scrollTop / height)) : 0;
        setScrollProgress(pct);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1500);
  };

  return (
    <div ref={scrollRef} className="min-h-screen bg-[#030303] text-zinc-100 font-sans selection:bg-red-600 selection:text-white overflow-x-hidden cursor-crosshair">
      
      {/* --- GLOBAL FX --- */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] mix-blend-overlay" 
           style={{ backgroundImage: `url("https://grainy-gradients.vercel.app/noise.svg")` }} />
      
      {/* PROGRESS BAR */}
      <motion.div 
        className="fixed top-0 left-0 h-1 bg-red-600 z-50 mix-blend-difference origin-left" 
        style={{ scaleX: scrollProgress, transformOrigin: "0%" }} 
      />

      {/* --- FIXED HERO TITLE (PARALLAX) --- */}
      <div className="fixed inset-0 flex items-center justify-center z-0 pointer-events-none overflow-hidden">
        <motion.h1 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1.2 }}
          className="text-[25vw] font-black text-[#0a0a0a] leading-none tracking-tighter uppercase select-none whitespace-nowrap"
        >
          UNFRAMED
        </motion.h1>
      </div>

      {/* --- CONTENT LAYER --- */}
      <main className="relative z-10">
        
        {/* HEADER */}
        <header className="fixed top-0 w-full p-6 flex justify-between items-start z-40 mix-blend-difference">
          <div className="font-mono text-xs text-zinc-500 uppercase tracking-[0.2em]">
            Merkurov Archive
          </div>
          <div className="font-mono text-xs text-red-600 uppercase tracking-[0.2em] animate-pulse">
            System Status: Online
          </div>
        </header>

        {/* SECTION 1: THE MANIFESTO */}
        <section className="min-h-screen flex items-center justify-center px-6 pt-32 pb-20">
          <div className="max-w-4xl w-full">
            <motion.div 
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 1 }}
            >
              <p className="font-mono text-xs text-red-600 mb-8 uppercase tracking-[0.2em] border-l-2 border-red-600 pl-4">
                01 / The Premise
              </p>
              <h2 className="text-3xl md:text-6xl font-serif leading-[1.1] text-zinc-100 antialiased">
                "I spent forty years running away from the boy on the floor. 
                I built networks on frozen rooftops. I hacked the first iPhones. I sold the ghost of the Empire as crypto. <br/><br/>
                It was all a detour. <br/>
                <Redacted>The System</Redacted> demanded <Redacted>noise</Redacted>. I gave it <Redacted>noise</Redacted>.
                But the granite eventually cracks. <br/><br/>
                <span className="text-white">UNFRAMED</span> is the story of closing the loop. Of returning to the only thing that matters: <span className="underline decoration-red-600 underline-offset-8">The Line</span>."
              </h2>
            </motion.div>
          </div>
        </section>

        {/* SECTION 2: THE TRAJECTORY (Timeline) */}
        <section className="bg-[#050505]/90 backdrop-blur-3xl border-t border-zinc-900">
          <div className="max-w-[1600px] mx-auto px-6 md:px-20 py-20">
            <div className="flex items-center gap-4 mb-20">
              <div className="w-16 h-[1px] bg-zinc-700" />
              <span className="font-mono text-xs text-zinc-500 uppercase tracking-[0.2em]">02 / The Trajectory</span>
            </div>

            <div className="flex flex-col">
              <TimelineItem 
                year="1984" 
                title="The Floor" 
                text="I am four years old. The sun cuts through the tall Stalinist windows. I am drawing. For a brief moment, the chaotic energy of the Soviet intelligentsia aligns into harmony around a boy with a pencil."
              />
              <TimelineItem 
                year="1998" 
                title="The Rooftops" 
                text="We drilled through walls built to withstand Nazi artillery. Minus 20 degrees Celsius. Balancing on the edge of seven-story buildings, running coaxial cables with frozen hands. Building the physical infrastructure of freedom."
              />
              <TimelineItem 
                year="2003" 
                title="The Glass Cage" 
                text="Walking past the Khodorkovsky trial daily. Inside, the richest man in the country sat in a cage. Outside, the city pretended nothing was happening. It was a public flogging broadcast on all frequencies."
              />
              <TimelineItem 
                year="2008" 
                title="The Spectral Tiger" 
                text="While the global economy collapsed, the price of a virtual tiger in World of Warcraft held steady. I realized then: Digital value doesn’t need banks. It only needs Consensus."
                image={ASSETS.TIGER}
              />
              <TimelineItem 
                year="2017" 
                title="The Source Code" 
                text="We took the original death mask of Vladimir Lenin and scanned it with lasers. We turned the idol into a file. The heavy stone of the Soviet legacy was dematerialized and sold as an NFT."
              />
              <TimelineItem 
                year="2022" 
                title="The Silence" 
                text="February 24th. Kievsky Railway Station. The names of the 'enemy' were embedded in the granite geography of Moscow. I expected rage. Instead, I saw a city that adjusted its headphones and kept walking. The silence was louder than the explosions."
                image={ASSETS.HERO_BG}
              />
              <TimelineItem 
                year="2025" 
                title="The Canvas" 
                text="The loop closed. I shut the door on the noise. I picked up the stylus. No more strategies, no more signals. Just the discipline of the artist. I am finally awake."
                isLast={true}
              />
            </div>
          </div>
        </section>

        {/* SECTION 3: SYSTEM ANALYSIS (The HUD) */}
        <section className="bg-zinc-900 border-y border-zinc-800 py-32 px-6">
           <div className="max-w-6xl mx-auto">
             <div className="grid md:grid-cols-2 gap-12 items-center">
                
                {/* Visual Data */}
                <div className="relative group">
                   <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-transparent opacity-20 group-hover:opacity-40 blur transition-opacity" />
                   <div className="relative border border-zinc-700 bg-black p-1">
                      <Image 
                        src={ASSETS.SYSTEM_MAP} 
                        alt="System Map" 
                        width={800} 
                        height={600}
                        className="w-full h-auto grayscale invert hover:invert-0 transition-all duration-500"
                      />
                      {/* Scanning Line Animation */}
                      <div className="absolute top-0 left-0 w-full h-[2px] bg-red-500 opacity-50 animate-[scan_3s_ease-in-out_infinite]" />
                      <style jsx>{`
                        @keyframes scan {
                          0%, 100% { top: 0%; opacity: 0; }
                          50% { opacity: 1; }
                          100% { top: 100%; opacity: 0; }
                        }
                      `}</style>
                   </div>
                   <p className="mt-4 font-mono text-[10px] text-zinc-500 uppercase tracking-widest text-right">
                     Fig 01. System Architecture [Decrypted]
                   </p>
                </div>

                {/* Audio Data */}
                <div className="space-y-8">
                   <div className="font-mono text-xs text-red-500 uppercase tracking-[0.2em] border-l-2 border-red-500 pl-4">
                     03 / AI Analysis
                   </div>
                   <h3 className="text-4xl font-bold text-white uppercase">
                     The Autopsy of an Empire
                   </h3>
                   <p className="text-lg text-zinc-400 font-serif leading-relaxed">
                     An AI-generated deconstruction of the manuscript. Two synthetic hosts analyze the shift from the heavy Granite of the Soviet past to the weightless Ether of the digital present.
                   </p>
                   
                   <div className="p-6 border border-zinc-800 bg-black/50">
                     <div className="flex items-center justify-between mb-4">
                        <span className="font-mono text-xs text-zinc-500">AUDIO_STREAM_01</span>
                        <div className="flex gap-1">
                          {[1,2,3,4].map(i => (
                            <div key={i} className="w-1 h-3 bg-red-600 animate-pulse" style={{animationDelay: `${i*0.1}s`}} />
                          ))}
                        </div>
                     </div>
                     <audio 
                        controls 
                        className="w-full h-8 invert opacity-60 hover:opacity-100 transition-opacity"
                        style={{ filter: "invert(1) hue-rotate(180deg)" }} 
                      >
                        <source src={ASSETS.AUDIO} type="audio/mp4" />
                        <source src={ASSETS.AUDIO} type="audio/x-m4a" />
                      </audio>
                   </div>
                </div>

             </div>
           </div>
        </section>

        {/* SECTION 4: THE GATE (Terminal Form) */}
        <section className="min-h-[80vh] flex flex-col items-center justify-center bg-[#0a0a0a] px-6 relative overflow-hidden">
           {/* Decorative Grid */}
           <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '40px 40px'}}></div>

           <div className="relative z-10 max-w-xl w-full bg-black border border-zinc-800 p-8 md:p-12 shadow-2xl">
              <div className="flex items-center gap-2 mb-8 border-b border-zinc-800 pb-4">
                 <Terminal size={18} className="text-red-500" />
                 <span className="font-mono text-xs text-zinc-500 uppercase tracking-[0.2em]">Secure Transmission</span>
              </div>

              <h2 className="text-3xl font-bold text-white mb-2 uppercase">Request Proposal</h2>
              <p className="text-zinc-500 font-mono text-xs mb-8">
                <span className="text-red-500">{'> '}</span>Access restricted to authorized agents.<br/>
                <span className="text-red-500">{'> '}</span>Enter credentials to initiate transfer.
              </p>

              {status === 'success' ? (
                <div className="bg-green-900/10 border border-green-900/50 p-6 text-green-500 font-mono text-xs">
                  <div><span className="text-red-500">{'> '}</span>SIGNAL RECEIVED.</div>
                  <div><span className="text-red-500">{'> '}</span>ENCRYPTED CHANNEL ESTABLISHED.</div>
                  <div><span className="text-red-500">{'> '}</span>STAND BY.</div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-0">
                  <div className="group relative">
                    <span className="absolute left-4 top-4 font-mono text-xs text-zinc-600 group-focus-within:text-red-500">NAME:</span>
                    <input type="text" className="w-full bg-black border border-zinc-800 p-4 pl-20 text-white font-mono text-sm focus:outline-none focus:border-red-600 transition-colors rounded-none" required />
                  </div>
                  <div className="group relative -mt-[1px]">
                    <span className="absolute left-4 top-4 font-mono text-xs text-zinc-600 group-focus-within:text-red-500">AGENCY:</span>
                    <input type="text" className="w-full bg-black border border-zinc-800 p-4 pl-20 text-white font-mono text-sm focus:outline-none focus:border-red-600 transition-colors rounded-none" required />
                  </div>
                  <div className="group relative -mt-[1px]">
                    <span className="absolute left-4 top-4 font-mono text-xs text-zinc-600 group-focus-within:text-red-500">EMAIL:</span>
                    <input type="email" className="w-full bg-black border border-zinc-800 p-4 pl-20 text-white font-mono text-sm focus:outline-none focus:border-red-600 transition-colors rounded-none" required />
                  </div>
                  <button type="submit" className="w-full bg-white text-black font-bold uppercase tracking-widest py-5 mt-6 hover:bg-red-600 hover:text-white transition-colors duration-300">
                    Initialize Request
                  </button>
                </form>
              )}
           </div>
        </section>

        </main>

        <footer className="w-full bg-black border-t border-zinc-900 py-8 text-center">
           <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest">
             Merkurov.Love / Unframed © 2025
           </p>
        </footer>

    </div>
  );
}