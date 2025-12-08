"use client";

import { useEffect, useState, useRef } from 'react';
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
import { createClient } from '@/lib/supabase-browser';

// --- CONFIGURATION ---
const RITUALS = [
  {
    id: 'vigil',
    title: 'VIGIL',
    subtitle: 'KEEP THE LIGHT',
    desc: 'The flame dies in 24 hours unless witnessed. If it is dark, strike a match. If it is lit, you are not alone.',
    path: '/vigil?mode=temple',
    icon: <Flame className="w-6 h-6" />,
    color: 'text-orange-500',
    glow: 'shadow-[0_0_50px_rgba(249,115,22,0.4)]',
    bg: 'bg-orange-500/10'
  },
  {
    id: 'letitgo',
    title: 'ASH',
    subtitle: 'INCINERATE NOISE',
    desc: 'Write it down. Watch it burn. Nothing is saved. The database is fire.',
    path: '/heartandangel/letitgo?mode=temple',
    icon: <Trash2 className="w-6 h-6" />,
    color: 'text-red-500',
    glow: 'shadow-[0_0_50px_rgba(239,68,68,0.4)]',
    bg: 'bg-red-900/10'
  },
  {
    id: 'cast',
    title: 'CAST',
    subtitle: 'FACE THE MIRROR',
    desc: 'You are defined by what you hide. Find your archetype: Stone, Void, Noise, or Unframed.',
    path: '/cast?mode=temple',
    icon: <ScanFace className="w-6 h-6" />,
    color: 'text-purple-400',
    glow: 'shadow-[0_0_50px_rgba(192,132,252,0.4)]',
    bg: 'bg-purple-900/10'
  },
  {
    id: 'absolution',
    title: 'DEBT',
    subtitle: 'GET RECEIPT',
    desc: 'Sin is just debt. Debt can be paid. Get a document that proves you are clean.',
    path: '/absolution?mode=temple',
    icon: <ReceiptText className="w-6 h-6" />,
    color: 'text-white',
    glow: 'shadow-[0_0_50px_rgba(255,255,255,0.2)]',
    bg: 'bg-zinc-800/50'
  }
];

export default function TemplePage() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [showManifest, setShowManifest] = useState(true); // Show on load
  const [userName, setUserName] = useState('Pilgrim');
  
  const activeRitual = RITUALS[activeIndex];

  // --- TELEGRAM & INIT ---
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      try {
        tg.setHeaderColor('#000000');
        tg.setBackgroundColor('#000000');
        // Disable vertical swipes to prevent closing in some OS
        tg.enableClosingConfirmation(); 
      } catch (e) {}
      
      const user = tg.initDataUnsafe?.user;
      if (user) setUserName(user.first_name || 'Pilgrim');
    }
  }, []);

  // --- NAVIGATION LOGIC ---
  const handleNext = () => {
    const next = (activeIndex + 1) % RITUALS.length;
    changeSlide(next);
  };

  const handlePrev = () => {
    const prev = (activeIndex - 1 + RITUALS.length) % RITUALS.length;
    changeSlide(prev);
  };

  const changeSlide = (index: number) => {
    setActiveIndex(index);
    // Haptics for Telegram
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.selectionChanged();
    }
  };

  const handleEnter = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    router.push(activeRitual.path);
  };

  // --- RENDER ---
  return (
    <div className="fixed inset-0 bg-black text-white font-mono flex flex-col overflow-hidden selection:bg-white selection:text-black">
      
      {/* GLOBAL STYLES FIX */}
      <style jsx global>{`
        header, footer { display: none !important; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* --- BACKGROUND AMBIENCE --- */}
      <div className={`absolute inset-0 transition-colors duration-700 ease-in-out opacity-20 ${activeRitual.bg}`} />
      
      {/* --- HEADER --- */}
      <header className="relative z-10 h-16 flex justify-between items-end px-6 pb-4 border-b border-white/5">
        <div>
          <h1 className="text-xl font-serif font-bold tracking-[0.1em] leading-none text-zinc-100">TEMPLE</h1>
          <div className="text-[8px] text-zinc-500 tracking-[0.3em] uppercase mt-1">Bureau of Silence</div>
        </div>
        <button 
          onClick={() => setShowManifest(true)}
          className="p-2 text-zinc-600 hover:text-white transition-colors"
        >
          <Info size={18} />
        </button>
      </header>

      {/* --- MAIN STAGE (THE ALTAR) --- */}
      <main className="flex-1 relative flex flex-col items-center justify-center z-10 w-full">
        
        {/* DYNAMIC ALTAR VISUAL */}
        <div className="relative w-full max-w-md aspect-square flex items-center justify-center">
          <AnimatePresence mode='wait'>
            <motion.div
              key={activeRitual.id}
              initial={{ opacity: 0, scale: 0.9, blur: 10 }}
              animate={{ opacity: 1, scale: 1, blur: 0 }}
              exit={{ opacity: 0, scale: 1.1, blur: 10 }}
              transition={{ duration: 0.4 }}
              className={`relative flex items-center justify-center`}
            >
              {/* Glow Effect */}
              <div className={`absolute inset-0 rounded-full blur-[60px] opacity-30 ${activeRitual.glow}`} />
              
              {/* Icon / Object */}
              <div className={`${activeRitual.color} opacity-90`}>
                {/* We scale the icon up significantly to act as the "Object" */}
                <div style={{ transform: 'scale(4)' }}>
                  {activeRitual.icon}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* TEXT DESCRIPTION */}
        <div className="absolute top-10 w-full px-8 text-center">
           <AnimatePresence mode='wait'>
            <motion.div
              key={activeRitual.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex flex-col gap-2"
            >
              <h2 className={`text-2xl font-bold tracking-widest ${activeRitual.color}`}>
                {activeRitual.title}
              </h2>
              <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">
                {activeRitual.subtitle}
              </div>
              <p className="mt-4 text-xs text-zinc-500 leading-relaxed max-w-xs mx-auto font-sans">
                {activeRitual.desc}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

      </main>

      {/* --- FOOTER: CAROUSEL & ACTIONS --- */}
      <div className="relative z-20 pb-8 pt-4 bg-gradient-to-t from-black via-black/90 to-transparent">
        
        {/* CAROUSEL CONTROLS */}
        <div className="flex items-center justify-between px-4 mb-6">
          <button onClick={handlePrev} className="p-4 text-zinc-600 hover:text-white active:scale-95 transition-all">
            <ChevronLeft />
          </button>
          
          {/* ACTION BUTTON */}
          <button 
            onClick={handleEnter}
            className={`
              h-12 px-8 rounded-sm border border-white/20 
              text-xs font-bold tracking-[0.2em] uppercase 
              bg-white/5 hover:bg-white/10 backdrop-blur-md
              transition-all active:scale-95 hover:border-${activeRitual.color.split('-')[1]}-500
            `}
          >
            ENTER RITUAL
          </button>

          <button onClick={handleNext} className="p-4 text-zinc-600 hover:text-white active:scale-95 transition-all">
            <ChevronRight />
          </button>
        </div>

        {/* INDICATORS (THE WHEEL) */}
        <div className="flex justify-center gap-3">
          {RITUALS.map((r, i) => (
            <button
              key={r.id}
              onClick={() => changeSlide(i)}
              className={`
                w-2 h-2 rounded-full transition-all duration-300
                ${i === activeIndex ? `bg-${r.color.split('-')[1]}-500 scale-125` : 'bg-zinc-800'}
                ${i === activeIndex ? activeRitual.color.replace('text-', 'bg-') : ''}
              `}
            />
          ))}
        </div>
      </div>

      {/* --- PIERROT (WHISPER) --- */}
      <div className="absolute bottom-6 right-6 z-30">
        <button 
          className="w-12 h-12 bg-black border border-zinc-800 rounded-full flex items-center justify-center text-zinc-500 hover:text-white hover:border-zinc-500 hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all active:scale-90"
          onClick={() => {
             // Placeholder for Whisper Logic
             alert("I am listening... (Module Loading)");
          }}
        >
          <Ear size={20} />
        </button>
      </div>

      {/* --- MANIFEST OVERLAY --- */}
      <AnimatePresence>
        {showManifest && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center"
            onClick={() => setShowManifest(false)}
          >
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="max-w-md space-y-6"
            >
              <h2 className="text-xl font-serif font-bold tracking-widest text-white border-b border-white/20 pb-4 inline-block">
                BUREAU OF SILENCE
              </h2>
              
              <div className="space-y-4 text-xs text-zinc-400 font-mono leading-relaxed">
                <p>The world outside is Noise.</p>
                <p>Data is Entropy.</p>
                <p>You are here to clean your cache.</p>
                <p className="text-zinc-500 italic">
                  This is not a church. This is a utility for the soul.
                  We trade in peace, receipts, and sparks in the dark.
                </p>
              </div>

              <div className="pt-8 animate-pulse text-[9px] tracking-[0.3em] uppercase text-zinc-600">
                Tap anywhere to begin
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}