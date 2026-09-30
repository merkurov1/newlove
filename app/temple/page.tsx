"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Flame, 
  Trash2, 
  ScanFace, 
  ReceiptText, 
  ArrowUpRight,
  Sparkles,
  Info,
  X,
  ShieldCheck
} from 'lucide-react';

export default function TemplePage() {
  const router = useRouter();
  const [showManifest, setShowManifest] = useState(false);

  // --- TELEGRAM WEBAPP INIT ---
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      try {
        tg.setHeaderColor('#F6F4EE');
        tg.setBackgroundColor('#F6F4EE');
        if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
      } catch (e) {}
    }
  }, []);

  const handleNavigate = (path: string) => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    router.push(path);
  };

  return (
    <div className="min-h-screen bg-[#F6F4EE] text-[#111111] font-sans selection:bg-[#111111] selection:text-white pb-24 relative overflow-x-hidden">
      
      {/* FORCE LIGHT OVERRIDES */}
      <style jsx global>{`
        header, footer { display: none !important; }
        body { background-color: #F6F4EE; }
      `}</style>

      {/* --- TOP HUD BAR --- */}
      <header className="sticky top-0 z-30 bg-[#F6F4EE]/90 backdrop-blur-md border-b-2 border-[#111111] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-[#E11D48] animate-pulse" />
            <h1 className="font-serif font-black text-xl tracking-widest text-[#111111]">
              TEMPLE
            </h1>
            <span className="text-xs font-mono font-bold tracking-widest text-zinc-500 hidden sm:inline">
              // TERMINAL_04
            </span>
          </div>

          <button
            onClick={() => setShowManifest(!showManifest)}
            className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest text-[#111111] hover:bg-[#111111] hover:text-white transition-all px-4 py-2 border-2 border-[#111111] shadow-[2px_2px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <Info size={14} />
            <span>MANIFEST</span>
          </button>

        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-8 space-y-10 relative z-10">

        {/* --- HERO POSTER BANNER --- */}
        <section className="border-2 border-[#111111] bg-white p-8 md:p-12 shadow-[6px_6px_0px_#111111] relative overflow-hidden">
          <div className="space-y-6 max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#111111] text-white font-mono text-[11px] font-bold tracking-[0.2em] uppercase">
              <Sparkles size={13} className="text-[#F59E0B]" />
              <span>DIGITAL SANCTUARY // ZERO LOGS</span>
            </div>

            <h2 className="text-3xl md:text-5xl font-serif font-black text-[#111111] tracking-tight leading-[1.1] uppercase">
              Purge the noise. <br className="hidden md:inline"/> Witness the void.
            </h2>

            <p className="text-base md:text-lg text-zinc-700 font-medium max-w-2xl leading-relaxed">
              The modern web is an algorithm designed for endless extraction. 
              <strong className="text-[#111111] font-bold"> Temple</strong> provides deterministic utilities for attention hygiene: 
              burn intrusive thoughts, witness collective presence, face your archetype, or wipe phantom debt.
            </p>
          </div>
        </section>

        {/* --- MANIFEST OVERLAY --- */}
        <AnimatePresence>
          {showManifest && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-[#111111] text-white border-2 border-[#111111] p-8 relative space-y-6 shadow-[6px_6px_0px_#E11D48]">
                <button 
                  onClick={() => setShowManifest(false)}
                  className="absolute top-4 right-4 text-zinc-400 hover:text-white p-2"
                >
                  <X size={20} />
                </button>

                <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#F59E0B] tracking-widest uppercase">
                  <ShieldCheck size={16} />
                  <span>ARCHITECTURE & SYSTEM ETHICS</span>
                </div>

                <div className="grid md:grid-cols-2 gap-8 text-sm font-sans leading-relaxed pt-2">
                  <div className="space-y-2">
                    <h4 className="font-mono text-xs text-[#6366F1] font-bold uppercase tracking-wider">01. Anti-Retention Protocol</h4>
                    <p className="text-zinc-300">No infinite feeds, notifications, or artificial engagement loops. Every interaction has a clean, immediate end state.</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-mono text-xs text-[#059669] font-bold uppercase tracking-wider">02. Cryptographic Privacy</h4>
                    <p className="text-zinc-300">ASH payload vanishes in client RAM. VIGIL logs timestamps without user identity. Zero database footprints.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- ASYMMETRIC GALLERY GRID (12 COLUMNS) --- */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b-2 border-[#111111] pb-3">
            <h3 className="text-xs font-mono font-bold uppercase tracking-[0.25em] text-[#111111]">
              // RITUAL_UTILITIES
            </h3>
            <span className="text-xs font-mono font-bold text-zinc-500">
              4 EXHIBITS ACTIVE
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            
            {/* --- 01. CAST (WIDE MODULE - 7 COLS) --- */}
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2 }}
              onClick={() => handleNavigate('/cast?mode=temple')}
              className="md:col-span-7 group cursor-pointer bg-white border-2 border-[#111111] p-8 flex flex-col justify-between shadow-[6px_6px_0px_#111111] hover:shadow-[10px_10px_0px_#6366F1] transition-all relative overflow-hidden"
            >
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#6366F1]/10 border-2 border-[#6366F1] text-[#6366F1]">
                      <ScanFace size={28} />
                    </div>
                    <div>
                      <span className="text-xs font-mono font-bold text-[#6366F1] tracking-widest block">
                        EXHIBIT // 01
                      </span>
                      <h4 className="text-3xl font-serif font-black tracking-tight text-[#111111] uppercase">
                        CAST
                      </h4>
                    </div>
                  </div>

                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-[#6366F1]/10 text-[#6366F1] border border-[#6366F1]">
                    DIAGNOSTIC
                  </span>
                </div>

                <div className="text-xs font-mono font-bold text-[#6366F1] tracking-[0.2em] uppercase">
                  FACE THE MIRROR
                </div>

                <p className="text-base text-zinc-700 font-medium leading-relaxed max-w-xl">
                  Decode your archetype (<strong className="text-[#111111]">Stone, Void, Noise, or Unframed</strong>) through rapid psychometric reactions. Get a permanent visual card.
                </p>
              </div>

              <div className="pt-8 flex items-center justify-between border-t-2 border-zinc-100 mt-6">
                <span className="font-mono text-xs font-bold tracking-widest text-[#111111] group-hover:text-[#6366F1] transition-colors">
                  START DIAGNOSTIC
                </span>
                <div className="w-10 h-10 border-2 border-[#111111] bg-[#111111] text-white group-hover:bg-[#6366F1] group-hover:border-[#6366F1] flex items-center justify-center transition-all">
                  <ArrowUpRight size={20} />
                </div>
              </div>
            </motion.div>

            {/* --- 02. ASH (TALL ACCENT MODULE - 5 COLS) --- */}
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2 }}
              onClick={() => handleNavigate('/heartandangel/letitgo?mode=temple')}
              className="md:col-span-5 group cursor-pointer bg-white border-2 border-[#111111] p-8 flex flex-col justify-between shadow-[6px_6px_0px_#111111] hover:shadow-[10px_10px_0px_#E11D48] transition-all relative overflow-hidden"
            >
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#E11D48]/10 border-2 border-[#E11D48] text-[#E11D48]">
                      <Trash2 size={28} />
                    </div>
                    <div>
                      <span className="text-xs font-mono font-bold text-[#E11D48] tracking-widest block">
                        EXHIBIT // 02
                      </span>
                      <h4 className="text-3xl font-serif font-black tracking-tight text-[#111111] uppercase">
                        ASH
                      </h4>
                    </div>
                  </div>

                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-[#E11D48]/10 text-[#E11D48] border border-[#E11D48]">
                    PURGE
                  </span>
                </div>

                <div className="text-xs font-mono font-bold text-[#E11D48] tracking-[0.2em] uppercase">
                  INCINERATE DATA
                </div>

                <p className="text-sm text-zinc-700 font-medium leading-relaxed">
                  Write what haunts you. Watch it burn into zero bytes in real time on screen. Nothing hits the database.
                </p>
              </div>

              <div className="pt-8 flex items-center justify-between border-t-2 border-zinc-100 mt-6">
                <span className="font-mono text-xs font-bold tracking-widest text-[#111111] group-hover:text-[#E11D48] transition-colors">
                  BURN TEXT
                </span>
                <div className="w-10 h-10 border-2 border-[#111111] bg-[#111111] text-white group-hover:bg-[#E11D48] group-hover:border-[#E11D48] flex items-center justify-center transition-all">
                  <ArrowUpRight size={20} />
                </div>
              </div>
            </motion.div>

            {/* --- 03. VIGIL (5 COLS) --- */}
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2 }}
              onClick={() => handleNavigate('/vigil?mode=temple')}
              className="md:col-span-5 group cursor-pointer bg-white border-2 border-[#111111] p-8 flex flex-col justify-between shadow-[6px_6px_0px_#111111] hover:shadow-[10px_10px_0px_#D97706] transition-all relative overflow-hidden"
            >
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#D97706]/10 border-2 border-[#D97706] text-[#D97706]">
                      <Flame size={28} />
                    </div>
                    <div>
                      <span className="text-xs font-mono font-bold text-[#D97706] tracking-widest block">
                        EXHIBIT // 03
                      </span>
                      <h4 className="text-3xl font-serif font-black tracking-tight text-[#111111] uppercase">
                        VIGIL
                      </h4>
                    </div>
                  </div>

                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-[#D97706]/10 text-[#D97706] border border-[#D97706]">
                    WITNESS
                  </span>
                </div>

                <div className="text-xs font-mono font-bold text-[#D97706] tracking-[0.2em] uppercase">
                  KEEP THE BEACON
                </div>

                <p className="text-sm text-zinc-700 font-medium leading-relaxed">
                  A 24-hour collective flame. Strike a match to witness and extend the light for everyone visiting.
                </p>
              </div>

              <div className="pt-8 flex items-center justify-between border-t-2 border-zinc-100 mt-6">
                <span className="font-mono text-xs font-bold tracking-widest text-[#111111] group-hover:text-[#D97706] transition-colors">
                  STRIKE MATCH
                </span>
                <div className="w-10 h-10 border-2 border-[#111111] bg-[#111111] text-white group-hover:bg-[#D97706] group-hover:border-[#D97706] flex items-center justify-center transition-all">
                  <ArrowUpRight size={20} />
                </div>
              </div>
            </motion.div>

            {/* --- 04. DEBT (7 COLS) --- */}
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2 }}
              onClick={() => handleNavigate('/absolution?mode=temple')}
              className="md:col-span-7 group cursor-pointer bg-white border-2 border-[#111111] p-8 flex flex-col justify-between shadow-[6px_6px_0px_#111111] hover:shadow-[10px_10px_0px_#059669] transition-all relative overflow-hidden"
            >
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#059669]/10 border-2 border-[#059669] text-[#059669]">
                      <ReceiptText size={28} />
                    </div>
                    <div>
                      <span className="text-xs font-mono font-bold text-[#059669] tracking-widest block">
                        EXHIBIT // 04
                      </span>
                      <h4 className="text-3xl font-serif font-black tracking-tight text-[#111111] uppercase">
                        DEBT
                      </h4>
                    </div>
                  </div>

                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-[#059669]/10 text-[#059669] border border-[#059669]">
                    LEDGER
                  </span>
                </div>

                <div className="text-xs font-mono font-bold text-[#059669] tracking-[0.2em] uppercase">
                  ABSOLUTION RECEIPT
                </div>

                <p className="text-base text-zinc-700 font-medium leading-relaxed max-w-xl">
                  Settle phantom obligations. Generate an official cryptographic receipt proving zero remaining balance.
                </p>
              </div>

              <div className="pt-8 flex items-center justify-between border-t-2 border-zinc-100 mt-6">
                <span className="font-mono text-xs font-bold tracking-widest text-[#111111] group-hover:text-[#059669] transition-colors">
                  GET RECEIPT
                </span>
                <div className="w-10 h-10 border-2 border-[#111111] bg-[#111111] text-white group-hover:bg-[#059669] group-hover:border-[#059669] flex items-center justify-center transition-all">
                  <ArrowUpRight size={20} />
                </div>
              </div>
            </motion.div>

          </div>
        </section>

      </main>
    </div>
  );
}
