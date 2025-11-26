'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

  // --- 1. SURGICAL AUTH (No setInterval junk) ---
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
        tg.expand();
        
        // Style Injection for seamless feel
        try { 
            tg.setHeaderColor('#000000'); 
            tg.setBackgroundColor('#000000'); 
            tg.enableClosingConfirmation(); // Prevent accidental swipe-to-close
        } catch (e) {}

        // Auth Data Sync
        const user = tg.initDataUnsafe?.user;
        if (user) {
           setUserName(user.first_name || 'Pilgrim');
           // Silent Auth Sync (Fire and Forget)
           fetch('/api/temple/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...user, initData: tg.initData })
           }).catch(() => {}); // Don't block UI on error
        }
      }
    };

    // Script injection strategy
    if ((window as any).Telegram?.WebApp) {
        initTelegram();
    } else {
        const script = document.createElement('script');
        script.src = "https://telegram.org/js/telegram-web-app.js";
        script.onload = initTelegram;
        document.head.appendChild(script);
    }
  }, []);

  // --- 2. TACTILE NAVIGATION ---
  const handleNav = async (href: string, serviceName: string) => {
    const tg = (window as any).Telegram?.WebApp;
    
    // Haptic Feedback (Physicality of Digital Assets)
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }

    // Analytics (Non-blocking)
    try {
        fetch('/api/temple_logs', {
            method: 'POST',
            body: JSON.stringify({ event_type: 'nav', message: `${userName} entered ${serviceName}` })
        });
    } catch (e) {}

    // Delay for animation feel
    setTimeout(() => router.push(href), 100);
  }

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col items-center relative overflow-hidden selection:bg-white selection:text-black">
      
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
        .temple-btn:active { transform: scale(0.96); border-color: #666; }
      `}</style>
      
      <div className="noise-overlay" />

      {/* HEADER */}
      <div className="mt-16 mb-12 text-center z-10 animate-in fade-in duration-700">
        <h1 className="text-4xl font-bold tracking-[0.3em] mb-3 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
          TEMPLE
        </h1>
        <div className="text-[9px] text-zinc-600 tracking-[0.5em] uppercase">
           PROTOCOL v.3.0
        </div>
      </div>

      {/* GRID CONTAINER */}
      <div className="w-full max-w-sm px-6 z-10 flex-1 flex flex-col justify-start gap-4">
        
        {/* SERVICES GRID */}
        <div className="grid grid-cols-2 gap-4">
          {SERVICES.map((s) => (
            <button 
                key={s.id}
                onClick={() => handleNav(s.path, s.name)}
                className="temple-btn group bg-zinc-950/80 border border-zinc-800 p-6 rounded-sm flex flex-col items-center justify-center gap-4 hover:border-zinc-500 hover:bg-zinc-900 transition-all aspect-square"
            >
                <div className="text-4xl filter grayscale group-hover:grayscale-0 transition-all duration-300 drop-shadow-md">
                    {s.icon}
                </div>
                <div className={`text-[10px] font-bold tracking-widest ${s.color} opacity-70 group-hover:opacity-100`}>
                    {s.name}
                </div>
            </button>
          ))}
        </div>

        {/* TRIBUTE (Special Asset) */}
        <button 
          onClick={() => handleNav('/tribute?mode=temple', 'Tribute')}
          className="temple-btn w-full bg-gradient-to-b from-[#1a1208] to-[#0d0904] border border-yellow-900/30 p-6 rounded-sm flex flex-row items-center justify-between gap-4 mt-2 hover:border-yellow-700/50 hover:shadow-[0_0_20px_rgba(255,215,0,0.1)] group"
        >
           <div className="flex flex-col items-start">
               <span className="text-xs font-bold tracking-[0.2em] text-yellow-600/90 group-hover:text-yellow-500 transition-colors">TRIBUTE</span>
               <span className="text-[9px] text-yellow-800/60 uppercase tracking-widest mt-1">Fuel the Light</span>
           </div>
           <div className="text-xl opacity-80 group-hover:scale-110 transition-transform">⚡</div>
        </button>

      </div>

      {/* LOGS (Atmosphere) */}
      <div className="w-full max-w-md px-6 mb-8 mt-auto z-10">
        <div className="border-t border-zinc-900/50 pt-4 opacity-50 hover:opacity-100 transition-opacity duration-500">
           <TempleLogsClient initialLogs={[]} />
        </div>
      </div>
    </div>
  );
}