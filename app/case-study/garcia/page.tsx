'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Play, X } from 'lucide-react';

// --- ASSETS ---
const ASSETS = {
  image: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1047.jpeg",
  audio: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/ElevenLabs_2025-12-02T14_52_04_Merkurov%20_ivc_sp100_s50_sb75_se0_b_m2.mp3",
};

// --- SCRIPT TIMING ---
const SCRIPT_EVENTS = [
  { start: 0, end: 4, text: "THE ANATOMY OF QUIETUDE", type: "title" },
  { start: 8, end: 12, text: "CALCULATED STRUCTURE", type: "keyword" },
  { start: 14, end: 18, text: "STUDIED SILENCE", type: "keyword" },
  { start: 24, end: 28, text: "1995", type: "big_number" },
  { start: 29, end: 34, text: "INTEGRITY", type: "keyword" },
  { start: 37, end: 41, text: "PURE GRANITE", type: "impact" },
  { start: 42, end: 46, text: "ARBITRAGE", type: "impact" },
  { start: 58, end: 62, text: "OIL ON CANVAS", type: "detail" },
  { start: 66, end: 69, text: "PROVENANCE: SOLID", type: "detail" },
  { start: 72, end: 78, text: "$8,000 USD", type: "money" },
];

export default function GarciaCaseStudy() {
  const [phase, setPhase] = useState<'gate' | 'session' | 'dossier'>('gate');
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const initializeSession = () => {
    setPhase('session');
    setTimeout(() => {
      audioRef.current?.play().catch(() => console.log("Autoplay blocked"));
    }, 500);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleAudioEnd = () => {
    setPhase('dossier');
  };

  const activeEvent = SCRIPT_EVENTS.find(e => currentTime >= e.start && currentTime <= e.end);

  return (
    <main className="fixed inset-0 z-[9999] w-full h-screen bg-black text-white overflow-hidden font-sans selection:bg-red-900 selection:text-white">
      
      {/* ==========================================
          LAYER 0: THE ARTWORK (With Pulse)
         ========================================== */}
      <div className={`absolute inset-0 z-0 will-change-transform 
          ${phase === 'session' ? 'animate-[subtleZoom_60s_linear_infinite]' : 'scale-100'}
      `}>
        <Image 
          src={ASSETS.image} 
          alt="Aimee Garcia - Untitled" 
          fill 
          className={`object-cover transition-all duration-[2000ms] 
            ${phase === 'gate' ? 'blur-2xl opacity-40 grayscale' : ''}
            ${phase === 'session' ? 'blur-0 opacity-100 grayscale-0' : ''} 
            ${phase === 'dossier' ? 'blur-md opacity-20' : ''}
          `}
          priority
        />
      </div>

      {/* ==========================================
          LAYER 1: ATMOSPHERE (Grain & Scanner)
          Only active during Session
         ========================================== */}
      {phase === 'session' && (
        <>
            {/* 1.1 NOISE/GRAIN OVERLAY (Cinema Feel) */}
            <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.08]" 
                 style={{backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")'}}>
            </div>

            {/* 1.2 THE SCANNER (Data Analysis Feel) */}
            <div className="absolute inset-0 z-1 pointer-events-none overflow-hidden">
                <div className="w-full h-[5px] bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.2)] animate-[scan_8s_linear_infinite]" />
            </div>
            
            {/* 1.3 VIGNETTE BREATHING (Focus) */}
            <div className="absolute inset-0 z-2 bg-[radial-gradient(circle,transparent_20%,black_120%)] animate-[pulse_4s_ease-in-out_infinite]" />
            
            {/* 1.4 DARK OVERLAY (Readability) */}
            <div className="absolute inset-0 z-3 bg-black/30" />
        </>
      )}
      
      {phase === 'gate' && <div className="absolute inset-0 z-1 bg-black/40" />}


      {/* --- AUDIO ENGINE --- */}
      <audio 
        ref={audioRef} 
        src={ASSETS.audio} 
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleAudioEnd}
      />

      {/* ==========================================
          PHASE 1: THE GATE
         ========================================== */}
      {phase === 'gate' && (
        <div className="relative z-10 flex flex-col items-center justify-center h-full animate-in fade-in duration-1000">
          <p className="text-xs tracking-[0.4em] text-stone-400 mb-6 uppercase">Private Viewing Room</p>
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-2 text-center tracking-tight">
            AIMÉE GARCÍA
          </h1>
          <p className="text-stone-500 font-mono text-sm mb-12">LOT. 59 // ASSET_ID: QUIETUDE</p>
          
          <button 
            onClick={initializeSession}
            className="group flex items-center space-x-3 px-8 py-4 border border-white/20 bg-black/50 backdrop-blur-md hover:bg-white hover:text-black transition-all duration-300 rounded-sm"
          >
            <Play className="w-4 h-4 fill-current" />
            <span className="text-sm tracking-widest uppercase font-semibold">Initialize Briefing</span>
          </button>
        </div>
      )}

      {/* ==========================================
          PHASE 2: THE SESSION
         ========================================== */}
      {phase === 'session' && (
        <div className="relative z-20 flex flex-col items-center justify-center h-full">
          {/* Dynamic Text Layer */}
          <div className="h-[200px] flex items-center justify-center w-full max-w-5xl px-4 text-center">
            {activeEvent && (
              <h2 className={`
                transition-all duration-500 ease-out transform drop-shadow-2xl
                ${activeEvent.type === 'title' ? 'text-3xl font-serif italic text-stone-200' : ''}
                ${activeEvent.type === 'keyword' ? 'text-5xl md:text-8xl font-bold tracking-tighter uppercase text-white scale-110' : ''}
                ${activeEvent.type === 'big_number' ? 'text-6xl md:text-9xl font-mono text-white' : ''}
                ${activeEvent.type === 'impact' ? 'text-5xl md:text-8xl font-black text-red-600 uppercase tracking-widest' : ''}
                ${activeEvent.type === 'money' ? 'text-5xl md:text-8xl font-serif text-emerald-400' : ''}
                ${activeEvent.type === 'detail' ? 'text-2xl font-mono text-stone-200 border-l-4 border-red-600 pl-6 bg-black/40 pr-4 py-2' : ''}
                animate-in fade-in slide-in-from-bottom-8
              `}>
                {activeEvent.text}
              </h2>
            )}
          </div>

          <div className="absolute bottom-10 w-full px-10 flex justify-between items-end text-xs font-mono text-stone-400">
            <div>
              <span className="animate-pulse text-red-500">● REC</span>
              <span className="ml-2">ANTON_MERKUROV // ANALYZING</span>
            </div>
            <button onClick={() => setPhase('dossier')} className="hover:text-white transition-colors border-b border-transparent hover:border-white">
              SKIP BRIEFING
            </button>
          </div>
        </div>
      )}

      {/* ==========================================
          PHASE 3: THE DOSSIER
         ========================================== */}
      {phase === 'dossier' && (
        <div className="relative z-30 h-full flex items-center justify-center p-4 md:p-10 animate-in slide-in-from-bottom-10 duration-1000 overflow-y-auto">
           <a href="/selection" className="absolute top-6 right-6 p-2 bg-black/50 rounded-full hover:bg-white hover:text-black transition-all cursor-pointer z-50">
             <X className="w-6 h-6" />
           </a>

          <div className="max-w-6xl w-full bg-stone-950/95 backdrop-blur-xl border border-stone-800 p-6 md:p-12 grid grid-cols-1 md:grid-cols-2 gap-12 shadow-2xl rounded-sm">
            
            <div className="relative h-[300px] md:h-full border border-stone-800 bg-stone-900 group overflow-hidden">
               <Image 
                 src={ASSETS.image} 
                 alt="Final View" 
                 fill 
                 className="object-cover transition-transform duration-700 group-hover:scale-105" 
               />
            </div>

            <div className="flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center space-x-2 text-red-600 mb-4">
                  <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                  <span className="text-xs font-mono uppercase tracking-widest">Opportunity Detected</span>
                </div>
                
                <h2 className="text-3xl md:text-4xl font-serif text-white mb-2">Untitled (Woman with Globe)</h2>
                <p className="text-stone-400 mb-6 font-light italic">Aimée García, 1995</p>
                
                <div className="space-y-4 border-t border-stone-800 pt-6 font-mono text-sm text-stone-300">
                  <div className="flex justify-between border-b border-stone-900 pb-2">
                    <span className="text-stone-500">Material</span>
                    <span>Oil on Canvas</span>
                  </div>
                  <div className="flex justify-between border-b border-stone-900 pb-2">
                    <span className="text-stone-500">Dimensions</span>
                    <span>50.5 x 63.2 cm</span>
                  </div>
                  <div className="flex justify-between border-b border-stone-900 pb-2">
                    <span className="text-stone-500">Provenance</span>
                    <span className="text-right text-emerald-500">Direct from Artist (2011)</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-stone-500">Est. Price</span>
                    <span className="text-3xl text-white font-serif">$8,000</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4">
                <a 
                  href="https://www.merkurov.love/aime-garca-b-1972-untitled-woman-with-globe" 
                  target="_blank"
                  className="block w-full text-center bg-white text-black py-4 font-bold uppercase tracking-widest hover:bg-stone-200 transition-all text-sm"
                >
                  Acquire Asset (Christie's)
                </a>
                <button 
                  onClick={() => window.location.reload()}
                  className="block w-full text-center border border-stone-800 text-stone-500 py-3 text-xs uppercase hover:text-white hover:border-stone-600 transition-all"
                >
                  Replay Protocol
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
      
      {/* GLOBAL STYLES FOR ANIMATIONS */}
      <style jsx global>{`
        @keyframes scan {
          0% { transform: translateY(-10vh); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(110vh); opacity: 0; }
        }
        @keyframes subtleZoom {
          0% { transform: scale(1); }
          100% { transform: scale(1.15); }
        }
      `}</style>
    </main>
  );
}