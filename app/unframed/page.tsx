"use client";

import React, { useRef, useState, useEffect } from 'react';
import { Terminal, Volume2 } from 'lucide-react';
import Image from 'next/image';

// --- ASSETS ---
const ASSETS = {
  HERO_BG: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1055.png",
  SYSTEM_MAP: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1054.png",
  TIGER: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg",
  AUDIO: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Digitize_the_Death_Mask_Encrypt_Freedom_Never.m4a"
};

// --- DATA: THE ARTIST ARC (SAFE) ---
const TIMELINE = [
  { 
    year: "1984", 
    title: "THE FLOOR", 
    text: "I am four years old. The sun cuts through the tall Stalinist windows. I am drawing. For a brief moment, the chaotic energy of the Soviet intelligentsia aligns into harmony around a boy with a pencil.",
    img: null
  },
  { 
    year: "1998", 
    title: "THE ROOFTOPS", 
    text: "We drilled through walls built to withstand Nazi artillery. Minus 20 degrees Celsius. Balancing on the edge of seven-story buildings, running coaxial cables with frozen hands. Building the physical infrastructure of freedom.",
    img: null
  },
  { 
    year: "2008", 
    title: "THE SPECTRAL TIGER", 
    text: "While the global economy collapsed, the price of a virtual tiger in World of Warcraft held steady. I realized then: Digital value doesn’t need banks. It only needs Consensus.",
    img: ASSETS.TIGER
  },
  { 
    year: "2017", 
    title: "THE SOURCE CODE", 
    text: "We took the original death mask of Vladimir Lenin and scanned it with lasers. We turned the idol into a file. The heavy stone of the Soviet legacy was dematerialized and sold as an NFT.",
    img: null
  },
  { 
    year: "2022", 
    title: "THE SILENCE", 
    text: "February 24th. The names of the 'enemy' were embedded in the granite geography of Moscow. I expected rage. Instead, I saw a city that adjusted its headphones and kept walking. The silence was louder than the explosions.",
    img: ASSETS.HERO_BG
  },
  { 
    year: "2025", 
    title: "THE CANVAS", 
    text: "The loop closed. I shut the door on the noise. I picked up the stylus. No more strategies, no more signals. Just the discipline of the artist. I am finally awake.",
    img: null,
    isLast: true
  }
];

// --- COMPONENTS ---

// 1. REDACTED TEXT
const Redacted = ({ children }: { children: React.ReactNode }) => (
  <span className="group relative inline-block cursor-help mx-1 align-bottom">
    <span className="relative z-10 bg-zinc-900 text-transparent select-none transition-all duration-300 group-hover:bg-transparent group-hover:text-red-500 group-hover:drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]">
      {children}
    </span>
    <span className="absolute inset-0 bg-white/10 animate-pulse group-hover:hidden" />
  </span>
);

// 2. PARALLAX SLIDE (THE DEEP DIVE)
// Simple scroll progress hook (0..1) for the long container
function useScrollProgress(targetRef: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const total = el.scrollHeight - window.innerHeight;
        const scrollTop = window.scrollY || window.pageYOffset;
        const containerTop = scrollTop + rect.top;
        const offset = Math.max(0, scrollTop - containerTop);
        const p = total > 0 ? Math.min(1, Math.max(0, offset / total)) : 0;
        setProgress(p);
        raf = 0;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [targetRef]);
  return progress;
}

const ParallaxSlide = ({ item, index, total, progress }: any) => {
  const segment = 1 / total;
  const start = index * segment;
  const peak = start + segment * 0.5;
  const end = start + segment;

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const remap = (t: number, a: number, b: number) => (t - a) / (b - a);

  const localT = (progress <= start || progress >= end) ? 0 : (progress <= peak ? remap(progress, start, peak) : 1 - remap(progress, peak, end));
  const opacity = localT;
  const scale = lerp(0.8, 1.1, Math.max(0, Math.min(1, (progress - start) / (end - start))));
  const blur = `${lerp(10, 0, localT)}px`;
  const y = `${lerp(50, -50, Math.max(0, Math.min(1, (progress - start) / (end - start))))}px`;

  return (
    <div 
      style={{ opacity, transform: `translateY(${y}) scale(${scale})`, filter: `blur(${blur})` }}
      className="absolute inset-0 flex items-center justify-center pointer-events-none p-6 transition-opacity duration-200"
    >
      <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-20 items-center">
        {/* Left: Huge Year */}
        <div className="relative">
           <h2 className="text-[20vw] leading-none font-black text-zinc-900/50 absolute -left-10 md:-left-20 -top-20 select-none z-0 mix-blend-overlay">
             {item.year}
           </h2>
           <div className="relative z-10 border-l-2 border-red-600 pl-6">
             <span className="font-mono text-xs text-red-600 tracking-[0.3em] uppercase block mb-4">Log Entry {item.year}</span>
             <h3 className="text-4xl md:text-7xl font-bold text-white uppercase tracking-tighter leading-[0.9]">
               {item.title}
             </h3>
           </div>
        </div>

        {/* Right: Narrative */}
        <div className="relative z-10 bg-black/80 backdrop-blur-md border border-zinc-800 p-8 md:p-10 shadow-2xl">
           <p className="text-lg md:text-2xl font-serif text-zinc-300 leading-relaxed">
             {item.text}
           </p>
           {item.img && (
             <div className="mt-8 relative w-full aspect-video border border-zinc-700 grayscale contrast-125 overflow-hidden">
               <Image src={item.img} alt="Evidence" fill className="object-cover" />
               <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30 mix-blend-overlay" />
             </div>
           )}
        </div>
      </div>
    </div>
  );
};


export default function UnframedPage() {
  const [status, setStatus] = useState('idle');
  const containerRef = useRef(null);
  const progress = useScrollProgress(containerRef);

  // Header Parallax (simple mapping)
  const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const headerT = clamp(progress / 0.2);
  const headerY = `${lerp(0, -100, headerT)}%`;
  const headerOpacity = lerp(1, 0, clamp(progress / 0.1));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1500);
  };

  return (
    <div className="bg-[#030303] text-white selection:bg-red-600 selection:text-white font-sans overflow-x-hidden">
      
      {/* GLOBAL GRAIN */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.04] mix-blend-overlay" 
           style={{ backgroundImage: `url("https://grainy-gradients.vercel.app/noise.svg")` }} />

      {/* FIXED HEADER */}
      <header 
        style={{ transform: `translateY(${headerY})`, opacity: headerOpacity }}
        className="fixed inset-0 flex flex-col items-center justify-center z-40 pointer-events-none"
      >
        <h1 className="text-[18vw] font-black uppercase tracking-tighter leading-none text-white mix-blend-difference">
          UNFRAMED
        </h1>
        <p className="font-mono text-sm uppercase tracking-[0.4em] text-red-600 mt-4 bg-black px-4 py-1">
          A Memoir by Anton Merkurov
        </p>
        <div className="absolute bottom-10 animate-bounce text-zinc-500 font-mono text-xs">
          SCROLL TO INITIALIZE
        </div>
      </header>

      {/* MANIFESTO SECTION (Static Top) */}
      <section className="h-screen flex items-end pb-32 justify-center px-6 relative z-10">
         <div className="max-w-3xl text-center">
            <p className="text-2xl md:text-4xl font-serif text-zinc-400 leading-relaxed">
              "I spent forty years running away from the boy on the floor. 
              <br/><br/>
              <Redacted>The System</Redacted> demanded <Redacted>noise</Redacted>. I gave it <Redacted>noise</Redacted>.
              But the granite eventually cracks.
              UNFRAMED is the story of closing the loop. Of returning to the only thing that matters: The Line."
            </p>
         </div>
      </section>

      {/* --- SCROLL TUNNEL CONTAINER --- */}
      {/* Height = Number of slides * 100vh */}
      <div ref={containerRef} className="relative" style={{ height: `${TIMELINE.length * 100}vh` }}>
        
        {/* STICKY VIEWPORT */}
        <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center justify-center">
           {TIMELINE.map((item, i) => (
             <ParallaxSlide 
               key={i} 
               item={item} 
               index={i} 
               total={TIMELINE.length} 
               progress={progress} 
             />
           ))}
        </div>

      </div>

      {/* --- STATIC FOOTER (Analysis & Form) --- */}
      <div className="relative z-20 bg-[#030303] border-t border-zinc-900">
        
        {/* SYSTEM ANALYSIS */}
        <section className="py-32 px-6">
           <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12">
              <div className="border border-zinc-800 p-8 relative overflow-hidden group">
                 <Image 
                   src={ASSETS.SYSTEM_MAP} 
                   alt="System Map" 
                   fill 
                   className="object-cover opacity-40 group-hover:opacity-60 transition-opacity grayscale invert"
                 />
                 <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
                 <div className="absolute bottom-8 left-8">
                    <p className="font-mono text-xs text-red-600 uppercase tracking-widest mb-2">Fig. 01</p>
                    <h3 className="text-2xl font-bold uppercase">System Architecture</h3>
                 </div>
              </div>

              <div className="flex flex-col justify-center">
                 <div className="flex items-center gap-3 mb-6 text-red-600 font-mono text-xs uppercase tracking-widest">
                    <Volume2 size={16} /> NotebookLM Audio Log
                 </div>
                 <h3 className="text-4xl font-bold mb-6">The Autopsy of an Empire</h3>
                 <p className="text-zinc-400 font-serif text-lg mb-8">
                   Two synthetic intelligences discuss the collapse of the vertical power structure and the shift to the Ether.
                 </p>
                 <div className="bg-zinc-900 border border-zinc-800 p-4">
                    <audio controls className="w-full invert opacity-70 hover:opacity-100 transition-opacity">
                      <source src={ASSETS.AUDIO} type="audio/mp4" />
                    </audio>
                 </div>
              </div>
           </div>
        </section>

        {/* TERMINAL FORM */}
        <section className="py-40 px-6 bg-black border-t border-zinc-900 flex justify-center">
           <div className="max-w-xl w-full">
              <div className="flex items-center gap-2 mb-8 text-zinc-500 font-mono text-xs uppercase tracking-widest">
                 <Terminal size={14} /> Encrypted Channel
              </div>
              
              <h2 className="text-5xl font-black uppercase mb-12 tracking-tighter">Request Access</h2>

              {status === 'success' ? (
                <div className="bg-green-900/10 border border-green-900/50 p-6 text-green-500 font-mono text-sm">
                  &gt; TRANSMISSION SUCCESSFUL.<br/>&gt; WE WILL ESTABLISH CONTACT.
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="relative">
                    <label className="absolute -top-3 left-0 font-mono text-xs text-zinc-500 bg-black pr-2">AGENT NAME</label>
                    <input type="text" className="w-full bg-black border-b border-zinc-800 py-4 text-white font-mono text-lg focus:outline-none focus:border-red-600 transition-colors uppercase placeholder-zinc-800" placeholder="ENTER NAME" required />
                  </div>
                  <div className="relative">
                    <label className="absolute -top-3 left-0 font-mono text-xs text-zinc-500 bg-black pr-2">AGENCY / HOUSE</label>
                    <input type="text" className="w-full bg-black border-b border-zinc-800 py-4 text-white font-mono text-lg focus:outline-none focus:border-red-600 transition-colors uppercase placeholder-zinc-800" placeholder="ENTER AGENCY" required />
                  </div>
                  <div className="relative">
                    <label className="absolute -top-3 left-0 font-mono text-xs text-zinc-500 bg-black pr-2">SECURE EMAIL</label>
                    <input type="email" className="w-full bg-black border-b border-zinc-800 py-4 text-white font-mono text-lg focus:outline-none focus:border-red-600 transition-colors uppercase placeholder-zinc-800" placeholder="ENTER EMAIL" required />
                  </div>
                  <button className="w-full bg-white text-black font-bold uppercase tracking-[0.2em] py-5 hover:bg-red-600 hover:text-white transition-colors mt-8">
                    Initialize Request
                  </button>
                </form>
              )}
           </div>
        </section>

        <footer className="py-8 text-center text-zinc-800 font-mono text-[10px] uppercase tracking-widest border-t border-zinc-900/50">
          Anton Merkurov / Unframed © 2025
        </footer>

      </div>
    </div>
  );
}