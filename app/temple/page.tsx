"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import TempleLogsClient from './TempleLogs.client';

const SERVICES = [
  { id: 'vigil', name: 'VIGIL', icon: '🕯️', path: '/vigil?mode=temple' },
  { id: 'letitgo', name: 'LET IT GO', icon: '❤️', path: '/heartandangel/letitgo?mode=temple' },
  { id: 'absolution', name: 'ABSOLVE', icon: '🧾', path: '/absolution?mode=temple' },
  { id: 'cast', name: 'CAST', icon: '💀', path: '/cast?mode=temple' },
];

export default function TemplePage() {
  const router = useRouter();
  const [userName, setUserName] = useState('Pilgrim');
  const [burning, setBurning] = useState(0);
  const [burningNames, setBurningNames] = useState('the temple waits');

  const supabase = createClient();

  useEffect(() => {
    const fetchState = async () => {
      const { data } = await supabase
        .from('vigil_hearts')
        .select('owner_name, last_lit_at');

      if (data) {
        const alive = data.filter((row: any) => {
          if (!row.last_lit_at) return false;
          return Date.now() - new Date(row.last_lit_at).getTime() < 86_400_000; // 24h
        });

        setBurning(alive.length);
        setBurningNames(
          alive.length > 0
            ? alive.map((r: any) => r.owner_name || 'someone').join('  ·  ')
            : 'the temple waits'
        );
      }
    };

    fetchState();

    const channel = supabase
      .channel('vigil-main-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, fetchState)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    const localUser = typeof window !== 'undefined' ? localStorage.getItem('temple_user') : null;
    if (localUser) setUserName(localUser);

    const initTelegram = () => {
      const tg = (window as any).Telegram?.WebApp;
      if (!tg) return;
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#000000');
      tg.setBackgroundColor('#000000');

      const user = tg.initDataUnsafe?.user;
      if (user?.first_name) setUserName(user.first_name);
    };

    if ((window as any).Telegram?.WebApp) initTelegram();
    else if (typeof window !== 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-web-app.js';
      script.onload = initTelegram;
      document.head.appendChild(script);
    }
  }, []);

  const handleNav = (href: string) => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    router.push(href);
  };

  const light = burning / 5;

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col items-center relative overflow-hidden">
      <style jsx global>{`
        body { background:#000 !important; }
        .noise { position:absolute; inset:0; pointer-events:none; opacity:0.06; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E"); }
        .temple-btn { position: relative; overflow: hidden; transition: all .18s cubic-bezier(.25,.46,.45,.94); }
      `}</style>

      <div className="noise" />

      <header className="mt-16 mb-8 text-center z-10">
        <h1 className="text-4xl font-bold tracking-[0.3em] mb-2">TEMPLE</h1>
        <div className="text-[9px] text-zinc-500 tracking-[0.5em] uppercase">PROTOCOL</div>
      </header>

      <main className="w-full max-w-sm px-6 flex-1">
        <div className="grid grid-cols-2 gap-4">
          {SERVICES.map(s => (
            <button key={s.id} onClick={() => handleNav(s.path)} className="temple-btn bg-zinc-950/80 border border-zinc-800 p-6 rounded-sm flex flex-col items-center justify-center gap-4 hover:border-zinc-500">
              <div className="text-4xl">{s.icon}</div>
              <div className="text-[10px] font-bold tracking-widest text-zinc-300 uppercase">{s.name}</div>
            </button>
          ))}
        </div>

        <button onClick={() => handleNav('/tribute?mode=temple')} className="temple-btn w-full bg-gradient-to-b from-[#1a1208] to-[#0d0904] border border-yellow-900/30 p-6 rounded-sm flex items-center justify-between gap-4 mt-4">
          <div>
            <div className="text-xs font-bold tracking-[0.2em] text-yellow-600">TRIBUTE</div>
            <div className="text-[9px] text-yellow-800/60 uppercase tracking-widest">Fuel the Light</div>
          </div>
          <div className="text-xl opacity-80">⚡</div>
        </button>

        <div className="mt-6 border-t border-zinc-900/50 pt-4">
          <TempleLogsClient initialLogs={[]} />
        </div>
      </main>

      <footer className="w-full max-w-md px-6 pb-8 text-center">
        <div className="text-[10px] text-white/30 font-mono tracking-widest">{burningNames}</div>
      </footer>
    </div>
  );
}