"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Volume2, ArrowDown, Hash, Globe, FileText, Lock, ChevronDown } from 'lucide-react';
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
  AUDIO: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Artist_Analyst_Anton_Merkurov__Unframing_the_Granite.m4a',
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

// REDACTED TEXT EFFECT
const Redacted = ({ children }: { children: React.ReactNode }) => (
  <span className="group relative inline-block cursor-help mx-1 align-bottom">
    <span className="relative z-10 text-transparent transition-all duration-300 group-hover:text-red-600 font-bold select-none group-hover:select-auto">
      {children}
    </span>
    <span className="absolute inset-0 bg-zinc-200 group-hover:bg-transparent transition-colors duration-300" />
  </span>
);

// PARALLAX SECTION (PRO VERSION)
const TimelineSection = ({ item }: any) => {
  const ref = useRef<HTMLElement | null>(null);

  // Compute element scroll progress (0..1) relative to viewport
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const handler = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const prog = (vh - rect.top) / (vh + rect.height);
        const clamped = Math.max(0, Math.min(1, prog));
        setProgress(clamped);
      });
    };
    handler();
    window.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler);
    return () => { window.removeEventListener('scroll', handler); window.removeEventListener('resize', handler); cancelAnimationFrame(raf); };
  }, []);

  const y = 100 + (-200 * progress);
  const opacity = progress <= 0 ? 0 : (progress < 0.2 ? progress / 0.2 : (progress < 0.9 ? 1 : Math.max(0, 1 - ((progress - 0.9) / 0.1))));

  return (
    <section ref={ref} className="min-h-screen flex items-center justify-center relative py-24 border-t border-zinc-900 bg-[#050505]">
      <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 px-6 items-center">
        
        {/* LEFT: STICKY TITLE */}
        <div className="relative">
          <motion.h2 
            style={{ opacity }}
            className="text-[15vw] md:text-[10vw] leading-none font-black text-zinc-900 select-none absolute -left-10 -top-20 z-0"
          >
            {item.year}
          </motion.h2>
          
          <div className="relative z-10 pl-6 border-l-2 border-red-600">
            <span className="font-mono text-xs text-red-500 tracking-[0.4em] uppercase block mb-4">
              Log Entry {item.year}
            </span>
            <h3 className="text-5xl md:text-7xl font-bold text-white uppercase tracking-tighter leading-[0.9] font-sans">
              {item.title}
            </h3>
          </div>
        </div>

        {/* RIGHT: CONTENT */}
        <motion.div style={{ y }} className="relative z-10">
          <p className="text-xl md:text-2xl font-serif text-zinc-300 leading-relaxed drop-shadow-xl">
            {item.text}
          </p>
          
          {item.img && (
            <div className="mt-12 relative w-full aspect-video border border-zinc-800 bg-zinc-900 overflow-hidden group grayscale hover:grayscale-0 transition-all duration-700">
              <Image 
                src={item.img} 
                alt="Evidence" 
                fill 
                className="object-cover scale-110 group-hover:scale-100 transition-transform duration-1000" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>
          )}
        </motion.div>

      </div>
    </section>
  );
};

export default function UnframedPage() {
  const [status, setStatus] = useState('idle');
  const [formData, setFormData] = useState({ name: '', agency: '', email: '' });
  
  // PRO SCROLL ANIMATION (HOOKS RESTORED)
    // Hero Scroll Animation (local replacement for framer-motion hooks)
    const [scrollY, setScrollY] = useState(0);
    useEffect(() => {
      const onScroll = () => setScrollY(window.scrollY || window.pageYOffset || 0);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
    }, []);

    const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const map = (v: number, inMin: number, inMax: number, outMin: number, outMax: number) => {
      const t = clamp((v - inMin) / (inMax - inMin), 0, 1);
      return outMin + (outMax - outMin) * t;
    };

    const heroOpacity = map(scrollY, 0, 500, 1, 0);
    const heroScale = map(scrollY, 0, 500, 1, 0.9);
    const titleY = map(scrollY, 0, 500, 0, 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');

    try {
      const payload = { form: formData };
      const res = await fetch('/api/unframed/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('Telegram API error:', text);
        setStatus('error');
        return;
      }

      setStatus('success');
      setFormData({ name: '', agency: '', email: '' });
    } catch (err) {
      console.error('Submit error', err);
      setStatus('error');
    }
  };

  return (
    <div className={`bg-[#050505] text-white selection:bg-red-600 selection:text-white font-sans overflow-x-hidden ${sans.variable} ${mono.variable} ${serif.variable}`}>
      
      {/* GLOBAL GRAIN */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] mix-blend-overlay" 
           style={{ backgroundImage: `url("https://grainy-gradients.vercel.app/noise.svg")` }} />

      {/* --- HERO: THE TITLE --- */}
      <motion.div 
        style={{ opacity: heroOpacity, scale: heroScale, y: titleY }}
        className="h-screen w-full flex flex-col items-center justify-center sticky top-0 z-0"
      >
        <h1 className="text-[18vw] font-black uppercase tracking-tighter leading-none text-white mix-blend-difference font-sans text-center">
          UNFRAMED
        </h1>
        
        {/* --- DESIGN UPDATE: RED LINES & MEMOIR TEXT --- */}
        <div className="flex items-center gap-6 mt-8 z-10 mix-blend-difference">
           <div className="h-[2px] w-12 bg-red-600 shadow-[0_0_15px_red]" />
           <p className="font-mono text-xs md:text-sm uppercase tracking-[0.3em] text-zinc-300">
             A Memoir by Anton Merkurov
           </p>
           <div className="h-[2px] w-12 bg-red-600 shadow-[0_0_15px_red]" />
        </div>
        {/* ---------------------------------------------- */}

      </motion.div>

      {/* --- MANIFESTO --- */}
      <div className="relative z-10 bg-[#050505] min-h-screen flex items-center justify-center px-6 pt-32 pb-32 border-t border-zinc-900 shadow-[0_-50px_100px_rgba(0,0,0,1)]">
         <div className="max-w-4xl text-center">
            <p className="text-3xl md:text-5xl font-serif text-zinc-100 leading-tight">
              "I spent forty years running away from the boy on the floor. 
              <br/><br/>
              <span className="text-zinc-500 text-2xl md:text-4xl block my-12 leading-normal">
                <Redacted>The System</Redacted> demanded <Redacted>noise</Redacted>.<br/> 
                I gave it <Redacted>noise</Redacted>.
              </span>
              But the granite eventually cracks.
              UNFRAMED is the story of closing the loop. Of returning to the only thing that matters: The Line."
            </p>
            
            <div className="mt-24 animate-bounce flex flex-col items-center gap-2 text-zinc-700 font-mono text-[10px] uppercase tracking-widest">
               <span>Initialize Sequence</span>
               <ChevronDown size={14} />
            </div>
         </div>
      </div>

      {/* --- TIMELINE STACK --- */}
      <main className="relative z-10 bg-[#050505]">
        {TIMELINE.map((item, i) => (
          <TimelineSection key={i} item={item} />
        ))}
      </main>

      {/* --- THE FOOTER ASSET --- */}
      <div className="relative z-20 bg-[#050505] border-t border-zinc-900 pb-20">
        
        {/* AUDIO */}
        <section className="py-32 px-6 border-b border-zinc-900">
           <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
              
              <div className="border border-zinc-800 p-2 bg-zinc-900/20 group hover:border-red-900/50 transition-colors">
                 <div className="relative aspect-square grayscale invert group-hover:grayscale-0 group-hover:invert-0 transition-all duration-700">
                    <Image src={ASSETS.SYSTEM_MAP} alt="Map" fill className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-50" />
                    <div className="absolute bottom-6 left-6 font-mono text-[10px] text-red-500 uppercase tracking-widest border border-red-500 px-3 py-1 bg-black">
                      Fig. 01: System Failure
                    </div>
                 </div>
              </div>

              <div>
                 <div className="flex items-center gap-3 mb-8 text-red-600 font-mono text-xs uppercase tracking-[0.2em]">
                    <Volume2 size={14} /> NotebookLM Audio Log
                 </div>
                 <h3 className="text-5xl md:text-6xl font-bold mb-8 uppercase font-sans tracking-tighter text-white">
                   Autopsy of <br/> an Empire
                 </h3>
                 <p className="text-zinc-400 font-serif text-lg mb-10 leading-relaxed border-l border-zinc-800 pl-6">
                   "Two synthetic intelligences deconstruct the manuscript, analyzing the shift from the heavy Granite of the Soviet past to the weightless Ether of the digital present."
                 </p>
                 <div className="bg-zinc-900/50 border border-zinc-800 p-6">
                    <audio controls className="w-full invert opacity-60 hover:opacity-100 transition-opacity">
                      <source src={ASSETS.AUDIO} type="audio/mp4" />
                    </audio>
                 </div>
              </div>
           </div>
        </section>

        {/* METRICS */}
        <section className="max-w-7xl mx-auto px-6 py-24">
           <div className="w-full h-[1px] bg-zinc-800 mb-6 relative overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                whileInView={{ width: '75%' }}
                transition={{ duration: 1.5, ease: "circOut" }}
                className="absolute top-0 left-0 h-full bg-red-600 shadow-[0_0_20px_red]" 
              />
           </div>
           <div className="flex justify-between items-center font-mono text-[10px] text-red-600 uppercase tracking-widest mb-12">
              <span>Status: Uploading</span>
              <span className="animate-pulse">75% Complete</span>
           </div>

           <div className="grid grid-cols-2 md:grid-cols-4 border border-zinc-800 bg-zinc-900/10">
              {[
                { icon: Hash, label: 'Length', val: '~60k Words' },
                { icon: FileText, label: 'Genre', val: 'Memoir / Noir' },
                { icon: Globe, label: 'Rights', val: 'Available' },
                { icon: Lock, label: 'Status', val: 'Proposal' },
              ].map((s, i) => (
                <div key={i} className="p-8 border-r border-b md:border-b-0 border-zinc-800 last:border-r-0">
                   <s.icon size={16} className="text-zinc-600 mb-4" />
                   <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2">{s.label}</p>
                   <p className="text-white font-mono text-lg">{s.val}</p>
                </div>
              ))}
           </div>
        </section>

        {/* TERMINAL FORM */}
        <section className="px-6 flex justify-center pb-20">
           <div className="max-w-xl w-full border border-zinc-800 p-10 bg-black shadow-2xl">
              <div className="flex items-center gap-2 mb-8 text-zinc-600 font-mono text-[10px] uppercase tracking-widest border-b border-zinc-900 pb-4">
                 <Terminal size={12} /> Encrypted Channel
              </div>
              
              <h2 className="text-4xl font-black uppercase mb-2 tracking-tighter text-white font-sans">Request Proposal</h2>
              <p className="font-serif text-zinc-500 text-sm mb-10">
                Access restricted to authorized agents & publishers.
              </p>

              {status === 'success' ? (
                <div className="bg-green-900/10 border border-green-900/30 p-6 text-green-500 font-mono text-xs leading-relaxed">
                  {'>'} TRANSMISSION SUCCESSFUL.<br/>{'>'} WE WILL ESTABLISH CONTACT.
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {['AGENT NAME', 'AGENCY / HOUSE', 'SECURE EMAIL'].map((ph, i) => (
                    <div key={i} className="group">
                      <input
                        type={ph.includes('EMAIL') ? 'email' : 'text'}
                        onChange={(e) => setFormData({...formData, [ph]: e.target.value})}
                        className="w-full bg-black border-b border-zinc-800 py-3 text-white font-mono text-sm focus:outline-none focus:border-red-600 transition-colors uppercase placeholder-zinc-800"
                        placeholder={ph}
                        required
                      />
                    </div>
                  ))}
                  <button className="w-full bg-white text-black font-bold uppercase tracking-[0.2em] py-4 hover:bg-red-600 hover:text-white transition-all mt-6 font-mono text-[10px]">
                    Initialize Request
                  </button>
                </form>
              )}
           </div>
        </section>

        {/* FOOTER */}
        <footer className="py-12 text-center text-zinc-800 font-mono text-[10px] uppercase tracking-widest border-t border-zinc-900/50 flex flex-col gap-2 bg-black">
          <span>Anton Merkurov / Unframed © 2025</span>
          <span>Moscow • London • Moscow • Ether</span>
        </footer>

      </div>
    </div>
  );
}