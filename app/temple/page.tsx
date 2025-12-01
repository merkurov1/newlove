"use client";

import { useEffect, useState } from 'react';
import MicrophoneButton from '@/components/MicrophoneButton';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import TempleLogsClient from './TempleLogs.client';

// --- CONFIG ---
const SERVICES = [
  { id: 'vigil', name: 'VIGIL', icon: '🕯', path: '/vigil?mode=temple', color: 'text-zinc-300' },
  { id: 'letitgo', name: 'LET IT GO', icon: '❤️', path: '/heartandangel/letitgo?mode=temple', color: 'text-zinc-300' },
  { id: 'absolution', name: 'ABSOLVE', icon: '🧾', path: '/absolution?mode=temple', color: 'text-zinc-300' },
  { id: 'cast', name: 'CAST', icon: '💀', path: '/cast?mode=temple', color: 'text-zinc-300' }
];

export default function TemplePage() {
  const router = useRouter();
  const [isTelegram, setIsTelegram] = useState(false);
  const [userName, setUserName] = useState('Pilgrim');
  const [dbHearts, setDbHearts] = useState<any[]>([]);

  const supabase = createClient();

  // derived realtime data
  const burningCount = dbHearts.filter(h => h?.last_lit_at && (Date.now() - new Date(h.last_lit_at).getTime()) < 24 * 60 * 60 * 1000).length;
  const burningNames = dbHearts
    .filter(h => h?.last_lit_at && (Date.now() - new Date(h.last_lit_at).getTime()) < 24 * 60 * 60 * 1000)
    .map(h => h.owner_name || 'someone')
    .join(' · ') || 'the temple waits';

  const glowColor = `rgba(255,140,60,${Math.min(burningCount / 5, 1) * 0.12})`;

  // --- 1. SURGICAL AUTH (Fixed) ---
  useEffect(() => {
    // Check Web Session
    const localUser = typeof window !== 'undefined' ? localStorage.getItem('temple_user') : null;
    if (localUser) setUserName(localUser);

    // Initialize Telegram
    const initTelegram = () => {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        setIsTelegram(true);
        tg.ready();
        tg.expand(); // Opens full height
        
        // Style Injection
        try { 
            tg.setHeaderColor('#000000'); 
            tg.setBackgroundColor('#000000'); 
            // REMOVED: tg.enableClosingConfirmation();  <-- THIS WAS THE ANNOYING POPUP
        } catch (e) {}

        // Auth Data Sync
        const user = tg.initDataUnsafe?.user;
        if (user) {
           setUserName(user.first_name || 'Pilgrim');
           // Silent Auth Sync
           fetch('/api/temple/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...user, initData: tg.initData })
           }).catch(() => {});
        }
      }
    };

    if ((window as any).Telegram?.WebApp) {
        initTelegram();
    } else {
        const script = document.createElement('script');
        script.src = "https://telegram.org/js/telegram-web-app.js";
        script.onload = initTelegram;
        document.head.appendChild(script);
    }

    // fetch initial hearts and subscribe to realtime changes
    const fetchHearts = async () => {
      try {
        const { data } = await supabase.from('vigil_hearts').select('*');
        if (data) setDbHearts(data as any[]);
      } catch (e) {
        // ignore
      }
    };

    fetchHearts();

    const channel = supabase
      .channel('temple_vigil_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, () => fetchHearts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // --- 2. TACTILE NAVIGATION ---
  const handleNav = async (href: string, serviceName: string) => {
    const tg = (window as any).Telegram?.WebApp;
    
    // Haptic Feedback
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light'); // Changed to 'light' for faster feel
    }

    // Analytics
    try {
        fetch('/api/temple_logs', {
            method: 'POST',
            body: JSON.stringify({ event_type: 'nav', message: `${userName} entered ${serviceName}` })
        });
    } catch (e) {}

    // Immediate navigation feels snappier
    router.push(href);
  }

  return (
    <div
      className="min-h-screen bg-black text-white font-mono flex flex-col items-center relative overflow-hidden selection:bg-white selection:text-black"
      style={{
        background: `radial-gradient(circle at 50% 30%, ${glowColor} 0%, rgba(0,0,0,0) 60%), #000`,
      }}
    >
      
      {/* NOISE & GLOBAL OVERRIDES */}
      <style jsx global>{`
        body { background-color: #000 !important; overscroll-behavior: none; }
        .noise-overlay {
            position: absolute; inset: 0; pointer-events: none; opacity: 0.07;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
            z-index: 0;
        }
        .temple-btn {
            position: relative; overflow: hidden;
            transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        .temple-btn:active { transform: scale(0.98); border-color: #444; }
      `}</style>
      
      <div className="noise-overlay" />

      {/* HEADER */}
      <div className="mt-16 mb-12 text-center z-10 animate-in fade-in duration-700 relative">
        {/* Microphone button top-right */}
        <div className="absolute right-6 top-6 z-30">
          <MicrophoneButton />
        </div>
        <h1 className="text-4xl font-serif font-bold tracking-[0.2em] mb-3 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
          TEMPLE
        </h1>
          <div className="text-[10px] text-zinc-600 tracking-[0.4em] uppercase font-mono">
            PROTOCOL v.3.0
          </div>

          {/* realtime burning count (in-flow to avoid overlapping content) */}
          <div className="mt-6 text-center">
            <div className="text-2xl md:text-3xl font-serif font-bold tracking-wide leading-tight">{burningCount}/5</div>
            <div className="text-[11px] text-white/40 tracking-widest font-mono mt-1 max-w-[80vw] truncate">{burningNames}</div>
          </div>
      </div>

      {/* small spacer so header and grid don't collide */}
      <div className="h-6 md:h-8" />

      {/* GRID CONTAINER */}
      <div className="w-full max-w-sm px-6 z-10 flex-1 flex flex-col justify-start gap-4">
        
        {/* SERVICES GRID */}
        <div className="grid grid-cols-2 gap-3">
          {SERVICES.map((s) => (
            <button 
                key={s.id}
                onClick={() => handleNav(s.path, s.name)}
                className="temple-btn group bg-[#0A0A0A] border border-white/5 p-6 rounded-sm flex flex-col items-center justify-center gap-4 hover:border-white/20 hover:bg-[#111] transition-all aspect-square shadow-[0_0_20px_rgba(0,0,0,0.5)]"
            >
                <div className="text-3xl filter grayscale group-hover:grayscale-0 group-hover:scale-110 transition-all duration-300 drop-shadow-md">
                    {s.icon}
                </div>
                <div className={`text-[9px] font-bold tracking-widest ${s.color} opacity-60 group-hover:opacity-100 font-mono`}>
                    {s.name}
                </div>
            </button>
          ))}
        </div>

        {/* TRIBUTE (Special Asset) */}
        <button 
          onClick={() => handleNav('/tribute?mode=temple', 'Tribute')}
          className="temple-btn w-full bg-gradient-to-r from-[#1a1208] via-[#0d0904] to-[#1a1208] border border-yellow-900/20 p-5 rounded-sm flex flex-row items-center justify-between gap-4 mt-2 hover:border-yellow-700/40 hover:shadow-[0_0_15px_rgba(255,215,0,0.05)] group"
        >
           <div className="flex flex-col items-start pl-2">
               <span className="text-[10px] font-bold tracking-[0.25em] text-yellow-600/80 group-hover:text-yellow-500 transition-colors font-mono">TRIBUTE</span>
               <span className="text-[8px] text-yellow-800/50 uppercase tracking-widest mt-1 font-mono">Fuel the Light</span>
           </div>
           <div className="text-sm opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-transform pr-2">⚡</div>
        </button>

      </div>

      {/* LOGS (Atmosphere) */}
      <div className="w-full max-w-md px-6 mb-8 mt-auto z-10">
        <div className="border-t border-white/5 pt-4 opacity-40 hover:opacity-100 transition-opacity duration-500">
           <TempleLogsClient initialLogs={[]} />
        </div>
      </div>
    </div>
  );
}