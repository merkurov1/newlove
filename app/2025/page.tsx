'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, ArrowRight } from 'lucide-react';
import Link from 'next/link';

// --- 1. DATA: THE INVENTORY ---

const WORKS = [
  {
    id: '01',
    title: 'Live Heart',
    category: 'GENERATIVE ART',
    desc: 'Digital heartbeat simulation. CSS/JS animation.',
    link: '/liveheart',
    visual: 'heart'
  },
  {
    id: '02',
    title: 'Unframed',
    category: 'NON-FICTION',
    desc: 'Autobiographical text covering the transition from analog to digital.',
    link: '/unframed',
    visual: 'book'
  },
  {
    id: '03',
    title: 'Transformation of Control',
    category: 'DEEP RESEARCH',
    desc: 'Analytical report for Novaya Gazeta. 2025 Year in Review.',
    link: '/research/novayagazeta2025',
    visual: 'report'
  },
  {
    id: '04',
    title: 'The Lab',
    category: 'DEV / EXPERIMENTAL',
    desc: 'Next.js & Supabase playground. The backend of the brand.',
    link: 'https://lab.merkurov.love',
    external: true,
    visual: 'code'
  },
  {
    id: '05',
    title: 'Case Study: Fontana',
    category: 'MARKET ANALYSIS',
    desc: 'Investment memorandum on Lucio Fontana’s "White Absolute".',
    link: '/case-study/fontana',
    visual: 'fontana'
  },
  {
    id: '06',
    title: 'Silence',
    category: 'MANIFESTO',
    desc: 'Digital hygiene and information strategy.',
    link: '/silence',
    visual: 'silence'
  },
];

// --- 2. SUB-COMPONENT: LIVE HEART (AUTO-PLAY VERSION) ---
// Упрощенная версия твоего кода для превью. Сразу запускает сердце.

const HeartPreview = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Config
    const particleCount = 800;
    const particles: any[] = [];
    let time = 0;

    // Resize
    const resize = () => {
        const parent = canvas.parentElement;
        if(parent) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        }
    };
    resize();
    window.addEventListener('resize', resize);

    // Heart Math
    const getHeartPos = (t: number, scale: number) => {
        let x = 16 * Math.pow(Math.sin(t), 3);
        let y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        return { x: x * scale, y: -y * scale };
    };

    // Init Particles
    for(let i=0; i<particleCount; i++) {
        particles.push({
            t: (Math.PI * 2 * i) / particleCount,
            offset: Math.random() * 100,
            size: Math.random() * 2 + 0.5,
            x: 0, y: 0
        });
    }

    // Loop
    const render = () => {
        time += 0.02;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#CC0000'; // PANIC RED
        
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const scale = Math.min(canvas.width, canvas.height) / 45;

        particles.forEach(p => {
            // Pulse physics
            const beat = Math.pow(Math.sin(time * 3), 4) * 15;
            const pos = getHeartPos(p.t, scale);
            
            // Glitch movement
            const noiseX = Math.cos(time + p.offset) * 5;
            const noiseY = Math.sin(time + p.offset) * 5;

            const finalX = cx + pos.x + noiseX + (pos.x/100 * beat);
            const finalY = cy + pos.y + noiseY + (pos.y/100 * beat);

            ctx.beginPath();
            ctx.arc(finalX, finalY, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        requestAnimationFrame(render);
    };
    render();

    return () => window.removeEventListener('resize', resize);
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full" />;
};

// --- 3. SUB-COMPONENTS: VISUAL PREVIEWS ---

const VisualRenderer = ({ type }: { type: string }) => {
    switch (type) {
        case 'heart':
            return (
                <div className="w-full h-full flex items-center justify-center bg-white relative">
                    <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/noise.png')]"></div>
                    <HeartPreview />
                    <div className="absolute bottom-10 text-[10px] font-mono tracking-widest text-[#CC0000] uppercase">
                        System Status: Alive
                    </div>
                </div>
            );
        case 'book':
            return (
                <div className="w-full h-full flex items-center justify-center bg-[#F4F4F4]">
                    <div className="w-[300px] h-[450px] border-2 border-black bg-white p-8 flex flex-col justify-between shadow-2xl relative">
                        <div className="text-xs font-bold tracking-widest uppercase">Merkurov</div>
                        <div className="text-5xl font-serif font-bold text-center">UN<br/>FRA<br/>MED</div>
                        <div className="text-xs font-mono text-center text-gray-400">Autobiography / 2025</div>
                    </div>
                </div>
            );
        case 'report':
            return (
                <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                    <div className="w-[320px] h-[400px] bg-white p-6 relative shadow-lg transform rotate-[-2deg]">
                        <div className="border-b-2 border-red-600 pb-2 mb-4 flex justify-between items-end">
                            <span className="text-xl font-black uppercase">Novaya</span>
                            <span className="text-[10px] font-mono">CONFIDENTIAL</span>
                        </div>
                        <div className="space-y-2">
                            <div className="h-2 bg-gray-200 w-full"></div>
                            <div className="h-2 bg-gray-200 w-5/6"></div>
                            <div className="h-2 bg-gray-200 w-full"></div>
                            <div className="h-2 bg-gray-200 w-4/6"></div>
                        </div>
                        <div className="mt-8 font-serif text-2xl font-bold leading-tight">
                            The Year<br/> The Major<br/> Moved In.
                        </div>
                        <div className="absolute bottom-6 right-6 w-16 h-16 border-2 border-red-600 rounded-full flex items-center justify-center text-[10px] font-bold text-red-600 rotate-12 opacity-50">
                            DEEP<br/>DIVE
                        </div>
                    </div>
                </div>
            );
        case 'silence':
            return (
                <div className="w-full h-full flex items-center justify-center bg-white">
                    <div className="text-center">
                        <div className="text-[10rem] leading-none text-gray-50 font-serif font-bold">
                            NULL
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-bold tracking-[1em] uppercase">Silence</span>
                        </div>
                    </div>
                </div>
            );
        case 'fontana':
             return (
                <div className="w-full h-full flex items-center justify-center bg-[#E5E5E5]">
                    <div className="w-[300px] h-[300px] bg-white shadow-inner flex items-center justify-center relative">
                        <div className="w-[4px] h-[180px] bg-black rounded-full absolute"></div>
                        <div className="absolute bottom-4 right-4 text-[10px] text-gray-400">Lucio Fontana</div>
                    </div>
                </div>
             );
        default:
            return (
                <div className="w-full h-full flex items-center justify-center bg-black text-white">
                    <div className="font-mono text-xs">NO VISUAL DATA</div>
                </div>
            );
    }
};

// --- 4. MAIN PAGE COMPONENT ---

export default function YearReviewSplit() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-[#CC0000] selection:text-white">
      
      {/* MOBILE HEADER (VISIBLE ONLY ON MOBILE) */}
      <div className="md:hidden pt-24 px-6 pb-8 border-b border-gray-100">
        <h1 className="text-6xl font-serif font-bold">2025</h1>
        <p className="text-xs uppercase tracking-widest text-gray-500 mt-2">Mobile View / List Only</p>
      </div>

      <div className="flex flex-col md:flex-row min-h-screen">
        
        {/* === LEFT COLUMN: THE INVENTORY === */}
        <div className="w-full md:w-1/2 pt-12 md:pt-32 pb-32 px-6 md:pl-16 md:pr-12 border-r border-gray-100 relative z-10 bg-white">
          
          {/* DESKTOP HEADER */}
          <header className="hidden md:block mb-24">
            <h1 className="text-8xl xl:text-9xl font-serif font-bold leading-[0.8] tracking-tight mb-6">
              2025
            </h1>
            <div className="flex justify-between items-end border-t border-black pt-4">
               <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                 Merkurov / Inventory
               </div>
               <div className="text-right text-xs font-mono">
                 Loc: Belgrade<br/>Dest: London
               </div>
            </div>
          </header>

          {/* LIST */}
          <div className="space-y-0">
            {WORKS.map((work, index) => (
              <Link 
                href={work.link} 
                key={work.id}
                target={work.external ? "_blank" : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                className="block group"
              >
                <div className={`py-8 border-b transition-colors duration-300 ${
                    activeIndex === index ? 'border-black' : 'border-gray-100'
                }`}>
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="flex items-center gap-4">
                      <span className={`font-mono text-xs transition-colors duration-300 ${
                          activeIndex === index ? 'text-[#CC0000]' : 'text-gray-300'
                      }`}>
                        {work.id}
                      </span>
                      <h2 className={`text-3xl md:text-4xl font-serif transition-all duration-300 ${
                          activeIndex === index ? 'translate-x-2' : ''
                      }`}>
                        {work.title}
                      </h2>
                    </div>
                    <ArrowUpRight className={`w-5 h-5 transition-opacity duration-300 ${
                        activeIndex === index ? 'opacity-100 text-[#CC0000]' : 'opacity-0'
                    }`} />
                  </div>
                  
                  <div className="pl-8 md:pl-10 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-gray-100 px-2 py-1 rounded-sm text-gray-500">
                      {work.category}
                    </span>
                    <p className={`text-sm text-gray-500 font-medium transition-opacity duration-300 ${
                        activeIndex === index ? 'opacity-100' : 'opacity-60'
                    }`}>
                      {work.desc}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* MOBILE FOOTER */}
          <div className="md:hidden mt-20 pt-10 border-t border-black">
             <p className="font-serif italic text-center text-gray-400">"Compiled in 60 days."</p>
          </div>
        </div>

        {/* === RIGHT COLUMN: THE VIEWING ROOM (STICKY) === */}
        <div className="hidden md:block w-1/2 h-screen sticky top-0 bg-[#FAFAFA] overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "circOut" }}
              className="w-full h-full p-12"
            >
              {/* Frame for the visual */}
              <div className="w-full h-full border border-gray-200 bg-white shadow-xl relative overflow-hidden">
                 <VisualRenderer type={WORKS[activeIndex].visual} />
                 
                 {/* Meta label inside visual */}
                 <div className="absolute top-6 left-6 text-[10px] font-mono text-gray-300 uppercase tracking-widest rotate-90 origin-top-left">
                    OBJ_ID: {WORKS[activeIndex].id}
                 </div>
              </div>

            </motion.div>
          </AnimatePresence>
        </div>

      </div>

      {/* === TICKER (FIXED BOTTOM) === */}
      <div className="fixed bottom-0 left-0 w-full bg-black text-white h-10 flex items-center overflow-hidden z-50 pointer-events-none">
        <motion.div 
          className="whitespace-nowrap flex gap-12 font-mono text-xs uppercase tracking-widest"
          animate={{ x: [0, -1000] }}
          transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
        >
          <span>Freedom costs $1000</span>
          <span>Life costs $1150</span>
          <span>Everything else is noise</span>
          <span className="text-[#CC0000]">///</span>
          <span>London 2026</span>
          <span className="text-[#CC0000]">///</span>
          <span>Compiled in 60 days</span>
          <span className="text-[#CC0000]">///</span>
          <span>Unframed Status: Active</span>
          {/* Repeat for seamless loop */}
          <span>Freedom costs $1000</span>
          <span>Life costs $1150</span>
          <span>Everything else is noise</span>
        </motion.div>
      </div>

    </div>
  );
}