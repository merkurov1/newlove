'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import TempleLogsClient from './TempleLogs.client';

export default function TemplePage() {
  const [isTelegram, setIsTelegram] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 1. Ручная загрузка скрипта (так надежнее всего)
    // Before loading Telegram script, check for an existing server-side session
    // so site users are recognised even without Telegram WebApp.
    (async function checkSession() {
      try {
        const res = await fetch('/api/temple/me', { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          if (json?.displayName) {
            try { localStorage.setItem('temple_user', json.displayName); } catch (e) {}
            setIsTelegram(true); // treat as an identified user for UI
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
          tg.expand();
          try { tg.BackButton.hide(); } catch (e) {}
          try { tg.setHeaderColor('#000000'); tg.setBackgroundColor('#000000'); } catch (e) {}

          // Тихая авторизация через наш API
          // Send full initData to server (safer: allows server to verify HMAC)
          const initData = (window as any).Telegram?.WebApp?.initData || null;
          const user = tg.initDataUnsafe?.user;
          if (user) {
            // Send auth to server; server sets an HTTP-only cookie.
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
                  setIsTelegram(true);
                }
              })
              .catch(err => console.error("Auth sync failed", err));
          }
        }
      }, 100);
      // Stop checking after 5s
      setTimeout(() => clearInterval(interval), 5000);
    };
    
    document.head.appendChild(script);

    return () => { 
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, []);

  // Ensure Telegram auth: try localStorage first, otherwise post initData to server
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
        try { localStorage.setItem('temple_user', json.displayName); } catch (e) {}
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // Navigation helper: ensure Telegram auth before navigating when in WebApp
  const handleNav = async (href: string) => {
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
    if (tg) {
      // Try to authenticate first
      await ensureTelegramAuth();
      // small delay to allow cookie to be set
      await new Promise(r => setTimeout(r, 150));
    }
    router.push(href);
  }

  // Клик по кнопке пишет в лог (через серверный API, использующий service-role key)
  const trackClick = async (service: string) => {
    try {
      const displayName = typeof window !== 'undefined' ? (localStorage.getItem('temple_user') || 'Кто-то') : 'Кто-то';
      await fetch('/api/temple_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'nav', message: `${displayName} entered ${service}` })
      });
    } catch (e) {
      console.warn('trackClick failed', e);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col p-4 relative overflow-hidden">
      
      {/* ЯДЕРНЫЙ CSS: Скрываем хедеры сайта */}
      <style jsx global>{`
        header, footer, nav, .header, .footer, #header, #footer {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            pointer-events: none !important;
        }
        html, body {
            background-color: #000000 !important;
            overflow-x: hidden;
        }
      `}</style>

      <div className="mt-8 mb-8 text-center z-10">
        <h1 className="text-3xl font-bold tracking-[0.2em] mb-1 text-white">TEMPLE</h1>
        <div className="text-[10px] text-zinc-500 tracking-widest uppercase mb-4">
           DIGITAL SANCTUARY
        </div>
      </div>

      {/* ЖИВАЯ ЛЕТОПИСЬ */}
      <div className="w-full max-w-md mb-8 min-h-[100px] flex flex-col justify-end items-center gap-2 pointer-events-none z-0 opacity-70">
        <TempleLogsClient initialLogs={[]} />
      </div>

      {/* МЕНЮ */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm z-10 mx-auto pb-10">
        <button onClick={async () => { await handleNav('/vigil?mode=temple'); trackClick('Vigil'); }} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform no-underline text-white">
          <div className="text-2xl">🕯</div>
          <div className="text-xs font-bold tracking-widest">VIGIL</div>
        </button>

        <button onClick={async () => { await handleNav('/heartandangel/letitgo?mode=temple'); trackClick('Let It Go'); }} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform no-underline text-white">
          <div className="text-2xl">❤️</div>
          <div className="text-xs font-bold tracking-widest">LET IT GO</div>
        </button>

        <button onClick={async () => { await handleNav('/absolution?mode=temple'); trackClick('Absolution'); }} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform no-underline text-white">
          <div className="text-2xl">🧾</div>
          <div className="text-xs font-bold tracking-widest">ABSOLVE</div>
        </button>

        <button onClick={async () => { await handleNav('/cast?mode=temple'); trackClick('Cast'); }} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform no-underline text-white">
          <div className="text-2xl">💀</div>
          <div className="text-xs font-bold tracking-widest">CAST</div>
        </button>
      </div>
    </div>
  );
}