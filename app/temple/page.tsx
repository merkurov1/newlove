'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TempleLogsClient from './TempleLogs.client';

export default function TemplePage() {
  const [isTelegram, setIsTelegram] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 1. Session check logic (Preserved)
    (async function checkSession() {
      try {
        const res = await fetch('/api/temple/me', { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          if (json?.displayName) {
            try { localStorage.setItem('temple_user', json.displayName); } catch (e) {}
            setIsTelegram(true); 
          }
        }
      } catch (e) {}
    })();

    const script = document.createElement('script');
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;

    script.onload = () => {
      const interval = setInterval(() => {
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
          clearInterval(interval);
          setIsTelegram(true);
          
          tg.ready();
          try { tg.expand(); } catch (e) {}
          try { tg.BackButton.hide(); } catch (e) {}
          try { tg.setHeaderColor('#000000'); tg.setBackgroundColor('#000000'); } catch (e) {}

          const initData = (window as any).Telegram?.WebApp?.initData || null;
          const user = tg.initDataUnsafe?.user;
          if (user) {
            fetch('/api/temple/auth', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...user, initData })
            })
              .then(res => res.json())
              .then(json => {
                if (json?.displayName) {
                  try { localStorage.setItem('temple_user', json.displayName); } catch (e) {}
                  if (json?.token) {
                    try { localStorage.setItem('temple_session_token', json.token); } catch (e) {}
                  }
                  setIsTelegram(true);
                }
              })
              .catch(err => console.error("Auth sync failed", err));
          }
        }
      }, 100);
      setTimeout(() => clearInterval(interval), 5000);
    };
    
    document.head.appendChild(script);
    return () => { 
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, []);

  // Helper: Telegram Auth Check
  async function ensureTelegramAuth() {
    try {
      const existing = typeof window !== 'undefined' ? localStorage.getItem('temple_user') : null;
      if (existing) return true;
      const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
      if (!tg) return false;
      const initData = tg.initData || (window as any).Telegram?.WebApp?.initData || null;
      const user = tg.initDataUnsafe?.user || null;
      if (!user) return false;
      
      const res = await fetch('/api/temple/auth', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, initData })
      });
      if (!res.ok) return false;
      const json = await res.json().catch(() => ({}));
      if (json?.displayName) {
        if (json?.token) try { localStorage.setItem('temple_session_token', json.token); } catch (e) {}
        try { localStorage.setItem('temple_user', json.displayName); } catch (e) {}
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  const handleNav = async (href: string) => {
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
    if (tg) {
      await ensureTelegramAuth();
      await new Promise(r => setTimeout(r, 150));
    }
    router.push(href);
  }

  const trackClick = async (service: string) => {
    try {
      const displayName = typeof window !== 'undefined' ? (localStorage.getItem('temple_user') || 'Pilgrim') : 'Pilgrim';
      await fetch('/api/temple_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'nav', message: `${displayName} entered ${service}` })
      });
    } catch (e) { console.warn('trackClick failed', e); }
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col items-center relative overflow-hidden">
      
      {/* GLOBAL STYLES & NOISE TEXTURE */}
      <style jsx global>{`
        header, footer, nav { display: none !important; }
        body { background-color: #000 !important; }
        .noise-overlay {
            position: absolute; inset: 0; pointer-events: none; opacity: 0.05;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
            z-index: 0;
        }
        .temple-btn {
            position: relative; overflow: hidden;
            transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        .temple-btn:active { transform: scale(0.96); }
        .temple-btn::after {
            content: ''; position: absolute; inset: 0;
            background: linear-gradient(to bottom, rgba(255,255,255,0.05), transparent);
            opacity: 0; transition: opacity 0.2s;
        }
        .temple-btn:hover::after { opacity: 1; }
      `}</style>
      
      <div className="noise-overlay" />

      {/* HEADER */}
      <div className="mt-12 mb-8 text-center z-10">
        <h1 className="text-4xl font-bold tracking-[0.3em] mb-2 text-white drop-shadow-lg">TEMPLE</h1>
        <div className="text-[10px] text-zinc-500 tracking-[0.4em] uppercase">
           DIGITAL SANCTUARY
        </div>
      </div>

      {/* GRID CONTAINER */}
      <div className="w-full max-w-sm px-6 z-10 flex-1 flex flex-col justify-center">
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* 1. VIGIL */}
          <button 
            onClick={async () => { await handleNav('/vigil?mode=temple'); trackClick('Vigil'); }} 
            className="temple-btn bg-zinc-950 border border-zinc-800 p-6 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-zinc-600"
          >
            <div className="text-3xl filter drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">🕯</div>
            <div className="text-[10px] font-bold tracking-widest text-zinc-300">VIGIL</div>
          </button>

          {/* 2. LET IT GO */}
          <button 
            onClick={async () => { await handleNav('/heartandangel/letitgo?mode=temple'); trackClick('Let It Go'); }} 
            className="temple-btn bg-zinc-950 border border-zinc-800 p-6 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-zinc-600"
          >
            <div className="text-3xl filter drop-shadow-[0_0_8px_rgba(255,0,0,0.3)]">❤️</div>
            <div className="text-[10px] font-bold tracking-widest text-zinc-300">LET IT GO</div>
          </button>

          {/* 3. ABSOLUTION */}
          <button 
            onClick={async () => { await handleNav('/absolution?mode=temple'); trackClick('Absolution'); }} 
            className="temple-btn bg-zinc-950 border border-zinc-800 p-6 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-zinc-600"
          >
            <div className="text-3xl">🧾</div>
            <div className="text-[10px] font-bold tracking-widest text-zinc-300">ABSOLVE</div>
          </button>

          {/* 4. CAST */}
          <button 
            onClick={async () => { await handleNav('/cast?mode=temple'); trackClick('Cast'); }} 
            className="temple-btn bg-zinc-950 border border-zinc-800 p-6 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-zinc-600"
          >
            <div className="text-3xl">💀</div>
            <div className="text-[10px] font-bold tracking-widest text-zinc-300">CAST</div>
          </button>
        </div>

        {/* 5. TRIBUTE (Full Width) */}
        <button 
          onClick={async () => { await handleNav('/tribute?mode=temple'); trackClick('Tribute'); }} 
          className="temple-btn w-full bg-[#110c05] border border-yellow-900/40 p-5 rounded-xl flex flex-row items-center justify-center gap-4 mb-4 hover:border-yellow-700 hover:bg-[#1a1208]"
        >
          <div className="text-xl">⚡</div>
          <div className="text-xs font-bold tracking-[0.2em] text-yellow-600/90">TRIBUTE</div>
        </button>

      </div>

      {/* LOGS (Sticky Bottom) */}
      <div className="w-full max-w-md pb-8 px-6 mt-auto z-10 opacity-60 hover:opacity-100 transition-opacity">
        <div className="border-t border-zinc-900 pt-4">
           <TempleLogsClient initialLogs={[]} />
        </div>
      </div>
    </div>
  );
}