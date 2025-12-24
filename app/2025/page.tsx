'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Globe, Lock, Activity, Zap, Layers, FileText } from 'lucide-react';
import Link from 'next/link';

// --- 1. DATA: THE FULL INVENTORY (10 ITEMS) ---

const WORKS = [
  {
    id: '01',
    title: 'Live Heart',
    category: 'GENERATIVE ART',
    desc: 'Digital heartbeat simulation. The core vitality metric.',
    link: '/liveheart',
    visual: 'heart'
  },
  {
    id: '02',
    title: 'Unframed',
    category: 'NON-FICTION',
    desc: 'The Book. Autobiography of the transition from Granite to Ether.',
    link: '/unframed',
    visual: 'book'
  },
  {
    id: '03',
    title: 'Transformation of Control',
    category: 'DEEP RESEARCH',
    desc: 'Novaya Gazeta Report. Analysis of hardware censorship & IMEI control.',
    link: '/research/novayagazeta2025',
    visual: 'report'
  },
  {
    id: '04',
    title: 'Research Hub',
    category: 'ARCHIVE',
    desc: 'Aggregated columns and publicist works archive.',
    link: '/research',
    visual: 'archive'
  },
  {
    id: '05',
    title: 'The Lab',
    category: 'DEV / EXPERIMENTAL',
    desc: 'Next.js & Supabase playground. The backend of the brand.',
    link: 'https://lab.merkurov.love',
    external: true,
    visual: 'lab'
  },
  {
    id: '06',
    title: 'Silence',
    category: 'FINANCIAL INDEX',
    desc: 'Strategy for value preservation. The liquidity of quiet assets.',
    link: '/silence',
    visual: 'silence'
  },
  {
    id: '07',
    title: 'Case Study: Fontana',
    category: 'MARKET ANALYSIS',
    desc: 'Investment memorandum: "The White Absolute".',
    link: '/case-study/fontana',
    visual: 'fontana'
  },
  {
    id: '08',
    title: 'Case Study: Garcia',
    category: 'VISUAL ASSET',
    desc: 'Deconstructing contemporary visual myths and value.',
    link: '/case-study/garcia',
    visual: 'garcia'
  },
  {
    id: '09',
    title: '/Cast',
    category: 'SEGMENTATION TOOL',
    desc: 'Psychometric profiling interface for user classification.',
    link: '/cast',
    visual: 'cast'
  },
  {
    id: '10',
    title: 'Let It Go',
    category: 'INTERACTIVE',
    desc: 'Digital catharsis mechanism. Burning emotional debt.',
    link: '/heartandangel/letitgo',
    visual: 'letitgo'
  },
];

// --- 2. LIVE HEART PREVIEW (Auto-running) ---

const HeartPreview = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const particleCount = 600;
    const particles: any[] = [];
    let time = 0;
    
    const resize = () => {
        const parent = canvas.parentElement;
        if(parent) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        }
    };
    resize();
    
    const getHeartPos = (t: number, scale: number) => {
        let x = 16 * Math.pow(Math.sin(t), 3);
        let y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        return { x: x * scale, y: -y * scale };
    };
    for(let i=0; i<particleCount; i++) {
        particles.push({ t: (Math.PI * 2 * i) / particleCount, offset: Math.random()*100, size: Math.random()*2+0.5 });
    }
    const render = () => {
        time += 0.02;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#CC0000';
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const scale = Math.min(canvas.width, canvas.height) / 40;
        particles.forEach(p => {
            const beat = Math.pow(Math.sin(time * 3), 4) * 10;
            const pos = getHeartPos(p.t, scale);
            const noiseX = Math.cos(time + p.offset) * 3;
            const noiseY = Math.sin(time + p.offset) * 3;
            ctx.beginPath();
            ctx.arc(cx + pos.x + noiseX + (pos.x/100*beat), cy + pos.y + noiseY + (pos.y/100*beat), p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        requestAnimationFrame(render);
    };
    render();
  }, []);
  return <canvas ref={canvasRef} className="w-full h-full" />;
};

// --- 3. VISUAL RENDERER (ALL 10 VISUALS) ---

const VisualRenderer = ({ type }: { type: string }) => {
    switch (type) {
        case 'heart':
            return (
                <div className="w-full h-full bg-white relative flex items-center justify-center">
                    <HeartPreview />
                    <div className="absolute bottom-6 right-6 font-mono text-[10px] text-red-600">LIVE_SIGNAL</div>
                </div>
            );
        case 'book':
            return (
                <div className="w-full h-full bg-[#F0F0F0] flex items-center justify-center">
                    <div className="w-[300px] h-[440px] bg-white border border-black shadow-2xl relative p-8 flex flex-col justify-between">
                        <div className="text-xs font-bold tracking-widest uppercase">Merkurov</div>
                        <h1 className="text-6xl font-serif font-bold leading-[0.8] tracking-tighter">UN<br/>FRA<br/>MED</h1>
                        <div className="text-[10px] font-mono border-t border-black pt-2">2025 EDITION</div>
                    </div>
                </div>
            );
        case 'report':
            return (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                    <div className="w-[320px] h-[420px] bg-white p-6 relative transform rotate-1">
                        <div className="border-b-4 border-red-600 pb-4 mb-4">
                            <div className="text-3xl font-black uppercase tracking-tight">Novaya</div>
                        </div>
                        <div className="font-serif text-2xl font-bold leading-tight">
                            The Year<br/>The Major<br/>Moved In.
                        </div>
                        <div className="mt-8 space-y-3">
                            <div className="h-1 bg-black w-full"></div>
                            <div className="h-1 bg-black w-2/3"></div>
                            <div className="h-1 bg-black w-full"></div>
                        </div>
                        <div className="absolute bottom-6 right-6 border border-red-600 text-red-600 text-[10px] font-bold px-2 py-1 rotate-[-10deg]">CONFIDENTIAL</div>
                    </div>
                </div>
            );
        case 'archive':
            return (
                <div className="w-full h-full bg-white flex items-center justify-center">
                    <div className="space-y-[-40px]">
                        <div className="w-48 h-64 bg-gray-100 border border-gray-300 shadow-md transform -rotate-6"></div>
                        <div className="w-48 h-64 bg-gray-50 border border-gray-300 shadow-md transform rotate-3"></div>
                        <div className="w-48 h-64 bg-white border border-black shadow-xl flex items-center justify-center relative z-10">
                            <FileText className="w-12 h-12 text-gray-300" />
                        </div>
                    </div>
                </div>
            );
        case 'lab':
            return (
                <div className="w-full h-full bg-black flex items-center justify-center font-mono text-green-500 p-12">
                    <div className="w-full text-xs break-all opacity-80 leading-relaxed">
                        {`> connecting to lab.merkurov...\n> status: experimental\n> stack: [next.js, supabase, ai]\n> ...\n> ...\n> ready.`}
                    </div>
                </div>
            );
        case 'silence':
            // FINANCIAL INDEX STYLE
            return (
                <div className="w-full h-full bg-white flex items-center justify-center relative">
                    <div className="absolute inset-0 grid grid-cols-6 grid-rows-6 opacity-5 pointer-events-none">
                        {[...Array(36)].map((_,i) => <div key={i} className="border-r border-b border-black"></div>)}
                    </div>
                    <div className="w-64 h-32 flex items-end gap-1">
                        {[20, 35, 40, 30, 45, 60, 55, 70, 65, 80, 75, 90, 85, 95, 100].map((h, i) => (
                            <motion.div 
                                key={i}
                                initial={{ height: 0 }}
                                animate={{ height: `${h}%` }}
                                transition={{ duration: 1, delay: i * 0.05 }}
                                className={`w-full ${i === 14 ? 'bg-[#CC0000]' : 'bg-gray-200'}`}
                            />
                        ))}
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl font-serif font-bold mix-blend-difference text-white tracking-widest">
                        SILENCE
                    </div>
                </div>
            );
        case 'fontana':
            return (
                <div className="w-full h-full bg-[#F0F0F0] flex items-center justify-center">
                    <div className="w-64 h-64 bg-white shadow-lg relative flex items-center justify-center">
                        {/* The Slash */}
                        <div className="w-[6px] h-[160px] bg-black rounded-[50%] blur-[1px] transform -rotate-12 shadow-inner"></div>
                    </div>
                </div>
            );
        case 'garcia':
            return (
                <div className="w-full h-full bg-white flex items-center justify-center">
                    {/* Visual Myth / Blur */}
                    <div className="w-64 h-64 rounded-full bg-gradient-to-tr from-blue-400 via-purple-400 to-red-400 blur-3xl opacity-50 animate-pulse"></div>
                    <div className="absolute text-xl font-bold uppercase tracking-widest mix-blend-multiply">MYTH</div>
                </div>
            );
        case 'cast':
            return (
                <div className="w-full h-full bg-[#111] flex items-center justify-center text-white">
                    <div className="relative w-64 h-64 border border-white/20 rounded-full flex items-center justify-center">
                        <div className="absolute w-full h-[1px] bg-white/20"></div>
                        <div className="absolute h-full w-[1px] bg-white/20"></div>
                        <div className="w-48 h-48 border border-white/20 rounded-full"></div>
                        <div className="w-32 h-32 border border-white/20 rounded-full"></div>
                        {/* Radar blip */}
                        <div className="absolute top-10 right-20 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_10px_red]"></div>
                    </div>
                </div>
            );
        case 'letitgo':
            return (
                <div className="w-full h-full bg-white flex items-center justify-center overflow-hidden">
                    <div className="relative">
                        <div className="text-4xl font-serif italic text-gray-300">Let it go</div>
                        {/* Particles representing burning */}
                        {[...Array(10)].map((_, i) => (
                            <motion.div
                                key={i}
                                className="absolute top-0 left-1/2 w-1 h-1 bg-red-500"
                                animate={{ 
                                    y: -100 - Math.random() * 100, 
                                    x: (Math.random() - 0.5) * 50,
                                    opacity: 0 
                                }}
                                transition={{ repeat: Infinity, duration: 1 + Math.random(), ease: "easeOut" }}
                            />
                        ))}
                    </div>
                </div>
            );
        default:
            return <div className="w-full h-full bg-gray-100"></div>;
    }
};

// --- 4. MAIN PAGE ---

export default function YearReviewComplete() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-[#CC0000] selection:text-white">
      
      {/* MOBILE HEADER */}
      <div className="md:hidden pt-24 px-6 pb-8 border-b border-gray-100">
        <h1 className="text-6xl font-serif font-bold">2025</h1>
        <p className="text-xs uppercase tracking-widest text-gray-500 mt-2">Inventory / Mobile View</p>
      </div>

      <div className="flex flex-col md:flex-row min-h-screen">
        
        {/* LEFT: LIST */}
        <div className="w-full md:w-1/2 pt-12 md:pt-32 pb-32 px-6 md:pl-16 md:pr-12 border-r border-gray-100 relative z-10 bg-white min-h-screen">
          
          <header className="hidden md:block mb-24">
            <h1 className="text-9xl font-serif font-bold leading-[0.8] tracking-tight mb-6">
              2025
            </h1>
            <div className="flex justify-between items-end border-t border-black pt-4">
               <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                 Merkurov / Assets
               </div>
               <div className="text-right text-xs font-mono text-gray-400">
                 Index Size: 10<br/>Status: Closed
               </div>
            </div>
          </header>

          <div className="space-y-0">
            {WORKS.map((work, index) => (
              <Link 
                href={work.link} 
                key={work.id}
                target={work.external ? "_blank" : undefined}
                rel={work.external ? "noopener noreferrer" : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                className="block group"
              >
                <div className={`py-6 md:py-8 border-b transition-all duration-300 ${
                    activeIndex === index ? 'border-black pl-4' : 'border-gray-100 pl-0'
                }`}>
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="flex items-center gap-4">
                      <span className={`font-mono text-xs transition-colors duration-300 ${
                          activeIndex === index ? 'text-[#CC0000]' : 'text-gray-300'
                      }`}>
                        {work.id}
                      </span>
                      <h2 className={`text-2xl md:text-3xl font-serif transition-colors duration-300 ${
                          activeIndex === index ? 'text-black' : 'text-gray-800'
                      }`}>
                        {work.title}
                      </h2>
                    </div>
                    <ArrowUpRight className={`w-5 h-5 transition-opacity duration-300 ${
                        activeIndex === index ? 'opacity-100 text-[#CC0000]' : 'opacity-0'
                    }`} />
                  </div>
                  
                  <div className="pl-8 md:pl-10 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm transition-colors duration-300 ${
                        activeIndex === index ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {work.category}
                    </span>
                    <p className={`text-xs md:text-sm text-gray-500 font-medium transition-opacity duration-300 ${
                        activeIndex === index ? 'opacity-100' : 'opacity-60'
                    }`}>
                      {work.desc}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          
          <div className="mt-20 pt-10 border-t border-black/20 text-center md:text-left">
             <p className="font-serif italic text-gray-400">"Compiled in 60 days."</p>
          </div>
        </div>

        {/* RIGHT: VIEWPORT */}
        <div className="hidden md:block w-1/2 h-screen sticky top-0 bg-[#FAFAFA] overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4, ease: "circOut" }}
              className="w-full h-full p-16 flex items-center justify-center"
            >
              {/* The Frame */}
              <div className="w-full aspect-square max-w-xl border border-gray-200 bg-white shadow-2xl relative overflow-hidden">
                 <VisualRenderer type={WORKS[activeIndex].visual} />
                 
                 {/* Metadata Overlay */}
                 <div className="absolute top-0 left-0 w-full p-6 flex justify-between pointer-events-none">
                    <div className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
                        OBJ: {WORKS[activeIndex].id}
                    </div>
                    <div className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
                        TYPE: {WORKS[activeIndex].category}
                    </div>
                 </div>
              </div>

            </motion.div>
          </AnimatePresence>
        </div>

      </div>

      {/* TICKER */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-black text-black h-10 flex items-center overflow-hidden z-50 pointer-events-none">
        <motion.div 
          className="whitespace-nowrap flex gap-12 font-mono text-xs uppercase tracking-widest"
          animate={{ x: [0, -1000] }}
          transition={{ repeat: Infinity, duration: 30, ease: "linear" }}
        >
          <span>London 2026</span>
          <span className="text-[#CC0000]">///</span>
          <span>Assets Loaded: 10</span>
          <span className="text-[#CC0000]">///</span>
          <span>Silence Strategy</span>
          <span className="text-[#CC0000]">///</span>
          <span>Freedom costs $1000</span>
          <span className="text-[#CC0000]">///</span>
          <span>Life costs $1150</span>
          <span className="text-[#CC0000]">///</span>
          <span>Everything else is noise</span>
          {/* Repeat */}
          <span>London 2026</span>
          <span className="text-[#CC0000]">///</span>
          <span>Assets Loaded: 10</span>
        </motion.div>
      </div>

    </div>
  );
}