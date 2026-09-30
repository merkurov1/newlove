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
  Terminal,
  Activity,
  ShieldCheck,
  Info,
  X
} from 'lucide-react';

interface Ritual {
  id: string;
  num: string;
  title: string;
  tagline: string;
  desc: string;
  path: string;
  icon: React.ReactNode;
  accent: string;
  borderHover: string;
  glow: string;
  status: string;
}

const RITUALS: Ritual[] = [
  {
    id: 'cast',
    num: '01',
    title: 'CAST',
    tagline: 'FACE THE MIRROR',
    desc: 'Decode your archetype (Stone, Void, Noise, or Unframed) through rapid psychometric reactions.',
    path: '/cast?mode=temple',
    icon: <ScanFace className="w-6 h-6 text-purple-400" />,
    accent: 'text-purple-400',
    borderHover: 'hover:border-purple-500/60',
    glow: 'group-hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]',
    status: 'DIAGNOSTIC'
  },
  {
    id: 'ash',
    num: '02',
    title: 'ASH',
    tagline: 'INCINERATE DATA',
    desc: 'Write what haunts you. Watch it burn into zero bytes in real time. Nothing hits the database.',
    path: '/heartandangel/letitgo?mode=temple',
    icon: <Trash2 className="w-6 h-6 text-red-500" />,
    accent: 'text-red-500',
    borderHover: 'hover:border-red-500/60',
    glow: 'group-hover:shadow-[0_0_30px_rgba(239,68,68,0.15)]',
    status: 'PURGE'
  },
  {
    id: 'vigil',
    num: '03',
    title: 'VIGIL',
    tagline: 'KEEP THE BEACON',
    desc: 'A 24-hour collective flame. Strike a match to witness and extend the light for everyone.',
    path: '/vigil?mode=temple',
    icon: <Flame className="w-6 h-6 text-amber-400" />,
    accent: 'text-amber-400',
    borderHover: 'hover:border-amber-500/60',
    glow: 'group-hover:shadow-[0_0_30px_rgba(245,158,11,0.15)]',
    status: 'WITNESS'
  },
  {
    id: 'absolution',
    num: '04',
    title: 'DEBT',
    tagline: 'ABSOLUTION RECEIPT',
    desc: 'Settle phantom obligations. Generate an official cryptographic receipt of zero balance.',
    path: '/absolution?mode=temple',
    icon: <ReceiptText className="w-6 h-6 text-emerald-400" />,
    accent: 'text-emerald-400',
    borderHover: 'hover:border-emerald-500/60',
    glow: 'group-hover:shadow-[0_0_30px_rgba(16,185,129,0.15)]',
    status: 'LEDGER'
  }
];

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
        tg.setHeaderColor('#000000');
        tg.setBackgroundColor('#000000');
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
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-mono selection:bg-white selection:text-black relative overflow-x-hidden pb-24">
      
      {/* FORCE GLOBAL OVERRIDES */}
      <style jsx global>{`
        header, footer { display: none !important; }
        body { background-color: #050505; }
      `}</style>

      {/* --- CYBER BACKGROUND GRID & SCANLINE --- */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#121212_1px,transparent_1px),linear-gradient(to_bottom,#121212_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none opacity-40" />

      {/* --- TOP TERMINAL HUD --- */}
      <header className="sticky top-0 z-30 bg-black/80 backdrop-blur-xl border-b border-zinc-800/80 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </div>
            <span className="font-bold tracking-[0.25em] text-white text-sm md:text-base">
              TEMPLE <span className="text-zinc-600 font-normal">// TERMINAL_04</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-zinc-500 tracking-wider">
              <Activity size={12} className="text-emerald-500" />
              <span>SYS_READY</span>
            </div>

            <button
              onClick={() => setShowManifest(!showManifest)}
              className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded border border-zinc-800 hover:border-zinc-600 bg-zinc-900/60"
            >
              <Info size={14} />
              <span>MANIFEST</span>
            </button>
          </div>

        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-10 space-y-10 relative z-10">

        {/* --- HERO / TERMINAL PROTOCOL INTRO --- */}
        <section className="border border-zinc-800 bg-zinc-950/80 rounded-xl p-6 md:p-10 relative overflow-hidden backdrop-blur-md shadow-2xl">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-[10px] uppercase tracking-[0.2em] text-emerald-400">
              <Terminal size={12} />
              <span>Protocol Active // No Trackers // Zero Logs</span>
            </div>

            <h1 className="text-2xl md:text-4xl font-serif font-bold text-white tracking-wide leading-tight">
              A digital sanctuary for attention hygiene & ritualistic reset.
            </h1>

            <p className="text-sm md:text-base text-zinc-400 font-sans leading-relaxed">
              The modern web is an algorithm designed for endless extraction. 
              <span className="text-white font-medium"> Temple</span> provides deterministic utilities to drop the noise: 
              burn intrusive thoughts, witness collective presence, face your archetype, or wipe phantom debt.
            </p>
          </div>
        </section>

        {/* --- MANIFEST EXPANDABLE / OVERLAY --- */}
        <AnimatePresence>
          {showManifest && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="border border-emerald-500/30 bg-zinc-950 p-6 md:p-8 rounded-xl relative space-y-4 shadow-[0_0_50px_rgba(16,185,129,0.1)]"
            >
              <button 
                onClick={() => setShowManifest(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white p-2"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-2 text-xs text-emerald-400 tracking-widest uppercase font-bold">
                <ShieldCheck size={16} />
                <span>ETHICS & SYSTEM ARCHITECTURE</span>
              </div>

              <div className="grid md:grid-cols-2 gap-6 text-sm text-zinc-300 font-sans leading-relaxed pt-2">
                <div className="space-y-1">
                  <h4 className="text-white font-mono text-xs uppercase font-bold tracking-wider">1. Anti-Retention Design</h4>
                  <p className="text-zinc-400 text-xs">No infinite feeds, notifications, or engagement loops. Every action has a clean, immediate end state.</p>
                </div>
                <div className="space-y-1">
                  <h4 className="text-white font-mono text-xs uppercase font-bold tracking-wider">2. Cryptographic Privacy</h4>
                  <p className="text-zinc-400 text-xs">ASH payload vanishes entirely in client memory. VIGIL records timestamps without identity. Zero persistence.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- RITUALS GRID --- */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <h2 className="text-xs font-mono uppercase tracking-[0.25em] text-zinc-500">
              // SELECT_RITUAL
            </h2>
            <span className="text-xs font-mono text-zinc-600">
              4 UTILITIES AVAILABLE
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {RITUALS.map((ritual) => (
              <motion.div
                key={ritual.id}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.2 }}
                onClick={() => handleNavigate(ritual.path)}
                className={`
                  group cursor-pointer bg-zinc-950/90 border border-zinc-800/90 rounded-xl p-6 md:p-8
                  flex flex-col justify-between space-y-6 transition-all duration-300
                  ${ritual.borderHover} ${ritual.glow} relative overflow-hidden
                `}
              >
                {/* CARD TOP */}
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:border-zinc-700 transition-colors">
                        {ritual.icon}
                      </div>
                      <div>
                        <span className="text-xs text-zinc-600 font-bold tracking-widest block">
                          [{ritual.num}]
                        </span>
                        <h3 className="text-2xl font-serif font-bold text-white tracking-wider">
                          {ritual.title}
                        </h3>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono uppercase tracking-widest px-3 py-1 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 group-hover:text-white transition-colors">
                      {ritual.status}
                    </span>
                  </div>

                  <div className={`text-xs font-bold tracking-[0.2em] uppercase ${ritual.accent}`}>
                    {ritual.tagline}
                  </div>

                  <p className="text-sm text-zinc-300 font-sans leading-relaxed">
                    {ritual.desc}
                  </p>
                </div>

                {/* CARD BOTTOM ACTION */}
                <div className="pt-4 border-t border-zinc-900 flex items-center justify-between text-xs font-bold tracking-widest uppercase text-zinc-400 group-hover:text-white transition-colors">
                  <span>ENTER RITUAL</span>
                  <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 group-hover:bg-white group-hover:text-black flex items-center justify-center transition-all">
                    <ArrowUpRight size={16} />
                  </div>
                </div>

              </motion.div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
