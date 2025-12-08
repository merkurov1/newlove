"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Flame, 
  Trash2, 
  ScanFace, 
  ReceiptText, 
  Ear, 
  Info, 
  ChevronRight, 
  ChevronLeft 
} from 'lucide-react';

// --- CONFIGURATION ---
const RITUALS = [
  {
    id: 'vigil',
    title: 'VIGIL',
    subtitle: 'KEEP THE LIGHT',
    desc: 'The flame dies in 24 hours unless witnessed. If it is dark, strike a match.',
    path: '/vigil?mode=temple',
    icon: <Flame className="w-10 h-10" />,
    color: 'text-orange-500',
    borderColor: 'border-orange-500/50',
    glow: 'shadow-[0_0_60px_rgba(249,115,22,0.3)]',
    bg: 'bg-orange-500/5'
  },
  {
    id: 'letitgo',
    title: 'ASH',
    subtitle: 'INCINERATE NOISE',
    desc: 'Write it down. Watch it burn. Nothing is saved. The database is fire.',
    path: '/heartandangel/letitgo?mode=temple',
    icon: <Trash2 className="w-10 h-10" />,
    color: 'text-red-500',
    borderColor: 'border-red-500/50',
    glow: 'shadow-[0_0_60px_rgba(239,68,68,0.3)]',
    bg: 'bg-red-900/5'
  },
  {
    id: 'cast',
    title: 'CAST',
    subtitle: 'FACE THE MIRROR',
    desc: 'You are defined by what you hide. Find your archetype: Stone, Void, Noise, or Unframed.',
    path: '/cast?mode=temple',
    icon: <ScanFace className="w-10 h-10" />,
    color: 'text-purple-400',
    borderColor: 'border-purple-500/50',
    glow: 'shadow-[0_0_60px_rgba(192,132,252,0.3)]',
    bg: 'bg-purple-900/5'
  },
  {
    id: 'absolution',
    title: 'DEBT',
    subtitle: 'GET RECEIPT',
    desc: 'Sin is just debt. Debt can be paid. Get a document that proves you are clean.',
    path: '/absolution?mode=temple',
    icon: <ReceiptText className="w-10 h-10" />,
    color: 'text-white',
    borderColor: 'border-white/50',
    glow: 'shadow-[0_0_60px_rgba(255,255,255,0.2)]',
    bg: 'bg-zinc-800/20'
  }
];

export default function TemplePage() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [showManifest, setShowManifest] = useState(false); // Changed to false for cleaner start
  
  const activeRitual = RITUALS[activeIndex];

  // --- TELEGRAM INIT ---
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      try {
        tg.setHeaderColor('#000000');
        tg.setBackgroundColor('#000000');
        if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
      } catch (e) {}
    }
  }, []);

  // --- NAVIGATION ---
  const changeSlide = (index: number) => {
    setActiveIndex(index);
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
  };

  const handleNext = () => changeSlide((activeIndex + 1) % RITUALS.length);
  const handlePrev = () => changeSlide((activeIndex - 1 + RITUALS.length) % RITUALS.length);

  const handleEnter = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    router.push(activeRitual.path);
  };

  // --- RENDER ---
  return (
    <div className="fixed inset-0 bg-black text-white font-mono flex flex-col overflow-hidden selection:bg-white selection:text-black">
      
      {/* FORCE HIDE GLOBAL UI */}
      <style jsx global>{`
        header, footer { display: none !important; }
      `}</style>

      {/* --- AMBIENT BG --- */}
      <div className={`absolute inset-0 transition-colors duration-1000 ease-in-out ${activeRitual.bg}`} />
      
      {/* --- HEADER --- */}
      <header className="relative z-10 h-16 shrink-0 flex justify-between items-end px-6 pb-2">
        <button onClick={() => setShowManifest(true)} className="p-2 -ml-2 text-zinc-600 hover:text-white transition-colors">
          <Info size={20} />
        </button>
      </header>

      {/* --- ALTAR (CENTER) --- */}
      <main className="flex-1 relative flex flex-col items-center justify-center z-10 w-full px-8 gap-8">
        
        {/* TEXT */}
        <div className="text-center space-y-2">
           <AnimatePresence mode='wait'>
            <motion.div
              key={activeRitual.id + '-text'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className={`text-3xl md:text-4xl font-serif font-bold tracking-[0.15em] ${activeRitual.color} drop-shadow-lg`}>
                {activeRitual.title}
              </h2>
              <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 mt-2">
                {activeRitual.subtitle}
              </div>
              <p className="mt-6 text-[11px] text-zinc-400 leading-relaxed font-sans max-w-[280px] mx-auto opacity-80">
                {activeRitual.desc}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* VISUAL OBJECT */}
        <div className="relative w-48 h-48 flex items-center justify-center">
          <AnimatePresence mode='wait'>
            <motion.div
              key={activeRitual.id + '-icon'}
              initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 1.2, rotate: 10 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="relative flex items-center justify-center"
            >
              {/* Outer Ring / Glow */}
              <div className={`
                absolute w-32 h-32 rounded-full border border-white/5 
                flex items-center justify-center backdrop-blur-sm
                ${activeRitual.glow} transition-all duration-700
              `}>
                 <div className={`absolute inset-0 rounded-full border ${activeRitual.borderColor} opacity-20`} />
              </div>
              
              {/* The Icon */}
              <div className={`${activeRitual.color} z-10 drop-shadow-2xl`}>
                  {activeRitual.icon}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

      </main>

      {/* --- FOOTER CONTROLS --- */}
      <div className="relative z-20 pb-10 pt-4 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col gap-6">
        
        {/* MAIN ACTION ROW */}
        <div className="flex items-center justify-center w-full px-6 gap-6">
          <button onClick={handlePrev} className="p-4 text-zinc-700 hover:text-zinc-300 active:scale-90 transition-all">
            <ChevronLeft size={24} />
          </button>
          
          <button 
            onClick={handleEnter}
            className={`
              h-14 px-10 rounded-sm border border-white/10 
              text-[11px] font-bold tracking-[0.2em] uppercase 
              bg-[#0A0A0A] hover:bg-[#111] hover:border-white/30
              shadow-[0_0_20px_rgba(0,0,0,0.5)]
              transition-all active:scale-95 active:border-${activeRitual.color.split('-')[1]}-500
            `}
          >
            ENTER RITUAL
          </button>

          <button onClick={handleNext} className="p-4 text-zinc-700 hover:text-zinc-300 active:scale-90 transition-all">
            <ChevronRight size={24} />
          </button>
        </div>

        {/* DOTS INDICATORS (FIXED SIZE) */}
        <div className="flex justify-center gap-4 h-4 items-center">
          {RITUALS.map((r, i) => (
            <button
              key={r.id}
              onClick={() => changeSlide(i)}
              className={`
                rounded-full transition-all duration-500 ease-out
                ${i === activeIndex 
                  ? `w-2 h-2 ${activeRitual.color.replace('text-', 'bg-')} shadow-[0_0_10px_currentColor]` 
                  : 'w-1.5 h-1.5 bg-zinc-800 hover:bg-zinc-700'}
              `}
            />
          ))}
        </div>
      </div>

      {/* --- PIERROT (WHISPER) --- */}
      <div className="absolute bottom-8 right-6 z-30">
        <button 
          className="w-10 h-10 flex items-center justify-center text-zinc-700 hover:text-white transition-all active:scale-90 active:text-white"
          onClick={() => alert("Pierrot is listening...")}
        >
          <Ear size={20} />
        </button>
      </div>

      {/* --- MANIFEST OVERLAY --- */}
      <AnimatePresence>
        {showManifest && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/98 flex flex-col items-center justify-center p-8 text-center"
            onClick={() => setShowManifest(false)}
          >
            <div className="space-y-6 max-w-xs">
              <h2 className="text-lg font-serif tracking-widest text-white border-b border-white/10 pb-4 inline-block">
                BUREAU OF SILENCE
              </h2>
              <p className="text-xs text-zinc-400 font-mono leading-relaxed">
                The world is Noise. Data is Entropy.<br/><br/>
                This is a utility for the soul.<br/>
                We trade in peace and receipts.
              </p>
              <div className="pt-8 text-[9px] tracking-[0.2em] text-zinc-600 uppercase animate-pulse">
                Tap to enter
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}