"use client";

import { useEffect, useState } from 'react';
import MicrophoneButton from '@/components/MicrophoneButton';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { motion, AnimatePresence } from 'framer-motion';

// --- CONFIG: NEW NAMING ---
const SERVICES = [
  { 
    id: 'vigil', 
    name: 'JOIN THE FLAME', 
    sub: '5 SLOTS ACTIVE',
    path: '/vigil?mode=temple', 
    type: 'live_slots',
    color: 'text-orange-500' 
  },
  { 
    id: 'letitgo', 
    name: 'BURN SECRET', 
    sub: 'INCINERATOR READY',
    path: '/heartandangel/letitgo?mode=temple', 
    type: 'counter',
    color: 'text-red-500' 
  },
  { 
    id: 'absolution', 
    name: 'GET RECEIPT', 
    sub: 'TRANSACTIONAL FORGIVENESS',
    path: '/absolution?mode=temple', 
    type: 'icon',
    color: 'text-white' 
  },
  { 
    id: 'cast', 
    name: 'WHO AM I?', 
    sub: 'PSYCHOMETRICS',
    path: '/cast?mode=temple', 
    type: 'glitch_text',
    color: 'text-zinc-400' 
  }
];

export default function TemplePage() {
  const router = useRouter();
  const [userName, setUserName] = useState('Stranger');
  const [dbHearts, setDbHearts] = useState<any[]>([]);
  const [ashCounter, setAshCounter] = useState(14502); // Fake base number
  const [onlineCount, setOnlineCount] = useState(1);

  const supabase = createClient();

  // --- REALTIME LOGIC ---
  const activeFlames = dbHearts.filter(h => h?.last_lit_at && (Date.now() - new Date(h.last_lit_at).getTime()) < 24 * 60 * 60 * 1000).length;
  
  // Fake "Live" feel
  useEffect(() => {
    const interval = setInterval(() => {
        setAshCounter(prev => prev + Math.floor(Math.random() * 2)); // Slowly increasing sins
        setOnlineCount(30 + Math.floor(Math.random() * 15)); // Fake online users
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // --- AUTH & DATA ---
  useEffect(() => {
    // 1. Telegram Init & Silent Auth
    const initTelegram = () => {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
        try { 
            tg.setHeaderColor('#000000'); 
            tg.setBackgroundColor('#000000'); 
        } catch (e) {}

        const user = tg.initDataUnsafe?.user;
        if (user) {
           setUserName(user.first_name || 'Pilgrim');
           // Background Auth Sync (Non-blocking)
           fetch('/api/temple/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...user, initData: tg.initData })
           }).catch(() => {});
        }
      }
    };

    if ((window as any).Telegram?.WebApp) initTelegram();
    else {
        const script = document.createElement('script');
        script.src = "https://telegram.org/js/telegram-web-app.js";
        script.onload = initTelegram;
        document.head.appendChild(script);
    }

    // 2. Fetch Vigil Data
    const fetchHearts = async () => {
      const { data } = await supabase.from('vigil_hearts').select('*');
      if (data) setDbHearts(data);
    };
    fetchHearts();

    // 3. Subscribe
    const channel = supabase
      .channel('temple_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, () => fetchHearts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // --- NAVIGATION ---
  const handleNav = (path: string) => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    router.push(path);
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col relative overflow-hidden selection:bg-white selection:text-black">
      
      {/* GLOBAL STYLES & NOISE */}
      <style jsx global>{`
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
        .animate-marquee { animation: marquee 20s linear infinite; }
        .noise-bg {
            position: absolute; inset: 0; pointer-events: none; opacity: 0.08;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }
      `}</style>
      <div className="noise-bg" />

      {/* --- HEADER: DASHBOARD STATUS --- */}
      <header className="flex justify-between items-center px-6 pt-6 pb-2 z-10 text-[10px] tracking-widest text-zinc-500 uppercase border-b border-zinc-900/50">
        <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-900 animate-pulse"></span>
            PROTOCOL v.4.1
        </div>
        <div>
            USER: <span className="text-zinc-300">{userName}</span>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 flex flex-col items-center justify-center w-full px-6 z-10 gap-8">
        
        {/* LOGO */}
        <div className="text-center mb-4">
            <h1 className="text-4xl md:text-5xl font-serif font-bold tracking-[0.15em] text-white/90">TEMPLE</h1>
            <div className="text-[9px] text-zinc-600 tracking-[0.5em] mt-2 uppercase">Bureau of Silence</div>
        </div>

        {/* 2x2 GRID */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            {SERVICES.map((s) => (
                <button 
                    key={s.id}
                    onClick={() => handleNav(s.path)}
                    className="group relative bg-[#080808] border border-white/10 hover:border-white/30 active:scale-95 transition-all duration-200 aspect-square flex flex-col items-start justify-between p-4 overflow-hidden rounded-sm"
                >
                    {/* WIDGET CONTENT */}
                    <div className="w-full">
                        {/* 1. VIGIL WIDGET */}
                        {s.type === 'live_slots' && (
                            <div className="flex gap-1.5 mt-1">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className={`w-2 h-2 rounded-full ${i < activeFlames ? 'bg-orange-500 shadow-[0_0_8px_orange]' : 'bg-zinc-800'}`} />
                                ))}
                            </div>
                        )}
                        {/* 2. COUNTER WIDGET */}
                        {s.type === 'counter' && (
                            <div className="font-mono text-lg text-zinc-500 group-hover:text-red-500 transition-colors">
                                {ashCounter.toLocaleString()}
                            </div>
                        )}
                        {/* 3. RECEIPT ICON */}
                        {s.type === 'icon' && (
                            <div className="text-2xl opacity-50 group-hover:opacity-100 transition-opacity">🧾</div>
                        )}
                        {/* 4. GLITCH TEXT */}
                        {s.type === 'glitch_text' && (
                            <div className="text-xs text-zinc-600 group-hover:text-white transition-colors">
                                ? ? ?
                            </div>
                        )}
                    </div>

                    {/* TEXT LABELS */}
                    <div className="text-left">
                        <div className={`text-[10px] font-bold tracking-wider ${s.color} font-mono`}>{s.name}</div>
                        <div className="text-[8px] text-zinc-600 mt-1 uppercase tracking-tight">{s.sub}</div>
                    </div>

                    {/* HOVER GLOW */}
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </button>
            ))}
        </div>

        {/* --- THE WHISPER (CENTRAL PIECE) --- */}
        <div className="w-full max-w-sm mt-4 flex flex-col items-center gap-3">
            <div className="text-[9px] text-zinc-600 tracking-[0.3em] uppercase animate-pulse">
                I am listening
            </div>
            
            {/* WRAPPER FOR EXISTING MICROPHONE BUTTON */}
            <div className="relative group">
                <div className="absolute inset-0 bg-zinc-800 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
                <div className="relative bg-[#0A0A0A] border border-white/10 rounded-full p-1 hover:border-white/40 transition-all shadow-2xl scale-125">
                    {/* Твой компонент микрофона встает сюда. Он должен быть прозрачным или вписываться. */}
                    <MicrophoneButton /> 
                </div>
            </div>
        </div>

      </main>

      {/* --- FOOTER: TICKER --- */}
      <footer className="h-8 bg-[#050505] border-t border-zinc-900 flex items-center overflow-hidden z-10">
        <div className="whitespace-nowrap animate-marquee flex gap-12 text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
            <span>Market: Fear</span>
            <span>Love: Contrarian Trade</span>
            <span>Vigil: {activeFlames}/5 Active</span>
            <span>Online: {onlineCount} Souls</span>
            <span>Status: Unframed</span>
            <span>Silence is Currency</span>
            <span>Don't Panic</span>
            <span>BTC: Inshallah</span>
        </div>
      </footer>

    </div>
  );
}