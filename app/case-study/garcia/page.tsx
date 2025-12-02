'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Play, Volume2, ArrowRight, Lock } from 'lucide-react';

// --- ASSETS ---
const ASSETS = {
  image: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1047.jpeg",
  audio: "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/ElevenLabs_2025-12-02T14_52_04_Merkurov%20_ivc_sp100_s50_sb75_se0_b_m2.mp3",
};

// --- SCRIPT TIMING (THE MAGIC) ---
// Текст появляется именно в тот момент, когда ты это говоришь.
const SCRIPT_EVENTS = [
  { start: 0, end: 4, text: "THE ANATOMY OF QUIETUDE", type: "title" },
  { start: 8, end: 12, text: "CALCULATED STRUCTURE", type: "keyword" },
  { start: 14, end: 18, text: "STUDIED SILENCE", type: "keyword" },
  { start: 24, end: 28, text: "1995", type: "big_number" },
  { start: 29, end: 34, text: "INTEGRITY", type: "keyword" },
  { start: 37, end: 41, text: "PURE GRANITE", type: "impact" }, // Heavy font
  { start: 42, end: 46, text: "ARBITRAGE", type: "impact" },
  { start: 58, end: 62, text: "OIL ON CANVAS", type: "detail" },
  { start: 66, end: 69, text: "PROVENANCE: SOLID", type: "detail" },
  { start: 72, end: 78, text: "$8,000 USD", type: "money" },
];

export default function GarciaCaseStudy() {
  const [phase, setPhase] = useState<'gate' | 'session' | 'dossier'>('gate');
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Start the Experience
  const initializeSession = () => {
    setPhase('session');
    setTimeout(() => {
      audioRef.current?.play();
    }, 500); // Small delay for cinematic feel
  };

  // Audio Progress Loop
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  // End of Audio -> Transition to Dossier
  const handleAudioEnd = () => {
    setPhase('dossier');
  };

  // Helper to find active text
  const activeEvent = SCRIPT_EVENTS.find(e => currentTime >= e.start && currentTime <= e.end);

  return (
    <main className="relative w-full min-h-screen bg-black text-white overflow-hidden font-sans selection:bg-red-900 selection:text-white">
      
      {/* --- BACKGROUND LAYER (ALWAYS PRESENT) --- */}
      <div className={`fixed inset-0 z-0 transition-transform duration-[100s] ease-linear will-change-transform ${phase === 'session' ? 'scale-125' : 'scale-100'}`}>
        <Image 
          src={ASSETS.image} 
          alt="Aimee Garcia - Untitled" 
          fill 
          className={`object-cover transition-all duration-[2000ms] 
            ${phase === 'gate' ? 'blur-xl opacity-30 grayscale' : ''}
            ${phase === 'session' ? 'blur-sm opacity-60' : ''} 
            ${phase === 'dossier' ? 'blur-md opacity-20' : ''}
          `}
          priority
        />
        <div className="absolute inset-0 bg-black/40" /> {/* Overlay */}
      </div>

      {/* --- AUDIO ENGINE --- */}
      <audio 
        ref={audioRef} 
        src={ASSETS.audio} 
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleAudioEnd}
      />

      {/* ==========================================
          PHASE 1: THE GATE (Start Screen)
         ========================================== */}
      {phase === 'gate' && (
        <div className="relative z-10 flex flex-col items-center justify-center h-screen animate-in fade-in duration-1000">
          <p className="text-xs tracking-[0.4em] text-stone-500 mb-6 uppercase">Private Viewing Room</p>
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-2 text-center tracking-tight">
            AIMÉE GARCÍA
          </h1>
          <p className="text-stone-400 font-mono text-sm mb-12">LOT. 59 // ASSET_ID: QUIETUDE</p>
          
          <button 
            onClick={initializeSession}
            className="group flex items-center space-x-3 px-8 py-4 border border-white/20 bg-black/50 backdrop-blur-md hover:bg-white hover:text-black transition-all duration-300 rounded-sm"
          >
            <Play className="w-4 h-4 fill-current" />
            <span className="text-sm tracking-widest uppercase font-semibold">Initialize Briefing</span>
          </button>
          
          <div className="absolute bottom-10 flex items-center space-x-2 text-stone-600 text-xs uppercase tracking-widest">
            <Volume2 className="w-3 h-3" />
            <span>Audio Required</span>
          </div>
        </div>
      )}

      {/* ==========================================
          PHASE 2: THE SESSION (Cinematic Playback)
         ========================================== */}
      {phase === 'session' && (
        <div className="relative z-20 flex flex-col items-center justify-center h-screen">
          {/* Dynamic Text Layer */}
          <div className="h-[200px] flex items-center justify-center w-full max-w-4xl px-4 text-center">
            {activeEvent && (
              <h2 className={`
                transition-all duration-700 ease-out transform
                ${activeEvent.type === 'title' ? 'text-3xl font-serif italic text-stone-300' : ''}
                ${activeEvent.type === 'keyword' ? 'text-5xl md:text-7xl font-bold tracking-tighter uppercase text-white' : ''}
                ${activeEvent.type === 'big_number' ? 'text-6xl md:text-9xl font-mono text-white' : ''}
                ${activeEvent.type === 'impact' ? 'text-5xl md:text-8xl font-black text-red-600 uppercase tracking-widest' : ''}
                ${activeEvent.type === 'money' ? 'text-5xl md:text-8xl font-serif text-emerald-500' : ''}
                ${activeEvent.type === 'detail' ? 'text-2xl font-mono text-stone-400 border-l-2 border-red-600 pl-4' : ''}
                animate-in fade-in slide-in-from-bottom-4
              `}>
                {activeEvent.text}
              </h2>
            )}
          </div>

          {/* Minimal Player Controls (Bottom) */}
          <div className="absolute bottom-10 w-full px-10 flex justify-between items-end text-xs font-mono text-stone-500">
            <div>
              <span>REC: ANTON_MERKUROV</span>
              <div className="flex space-x-1 mt-1 h-2">
                 {/* Fake Vizualizer */}
                 {[...Array(5)].map((_,i) => (
                   <div key={i} className="w-1 bg-red-600 animate-pulse" style={{height: Math.random() * 10 + 4 + 'px', animationDelay: i * 0.1 + 's'}}/>
                 ))}
              </div>
            </div>
            <button onClick={() => setPhase('dossier')} className="hover:text-white transition-colors">
              SKIP BRIEFING &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ==========================================
          PHASE 3: THE DOSSIER (Final State)
         ========================================== */}
      {phase === 'dossier' && (
        <div className="relative z-30 min-h-screen flex items-center justify-center p-4 md:p-10 animate-in slide-in-from-bottom-10 duration-1000">
          
          <div className="max-w-5xl w-full bg-stone-950/90 backdrop-blur-xl border border-stone-800 p-8 md:p-12 grid grid-cols-1 md:grid-cols-2 gap-12 shadow-2xl">
            
            {/* Left: The Image (Clear now) */}
            <div className="relative h-[400px] md:h-full border border-stone-800 bg-stone-900 group overflow-hidden">
               <Image 
                 src={ASSETS.image} 
                 alt="Final View" 
                 fill 
                 className="object-cover transition-transform duration-700 group-hover:scale-105" 
               />
               <div className="absolute bottom-0 left-0 bg-black/80 px-4 py-2 text-white text-xs font-mono">
                 LOT 59
               </div>
            </div>

            {/* Right: The Data */}
            <div className="flex flex-col justify-between space-y-8">
              <div>
                <div className="flex items-center space-x-2 text-red-600 mb-4">
                  <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                  <span className="text-xs font-mono uppercase tracking-widest">Opportunity Detected</span>
                </div>
                
                <h2 className="text-4xl font-serif text-white mb-2">Untitled (Woman with Globe)</h2>
                <p className="text-stone-400 mb-6 font-light">Aimée García, 1995</p>
                
                <div className="space-y-4 border-t border-stone-800 pt-6 font-mono text-sm text-stone-300">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Material</span>
                    <span>Oil on Canvas</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Dimensions</span>
                    <span>50.5 x 63.2 cm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Provenance</span>
                    <span className="text-right">Artist Direct (2011)</span>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-stone-800">
                    <span className="text-stone-500">Est. Price</span>
                    <span className="text-2xl text-emerald-400 font-serif">$8,000 USD</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <a 
                  href="https://www.merkurov.love/aime-garca-b-1972-untitled-woman-with-globe" 
                  target="_blank"
                  className="block w-full text-center bg-white text-black py-4 font-bold uppercase tracking-widest hover:bg-stone-200 transition-all"
                >
                  Acquire Asset
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
    </main>
  );
}