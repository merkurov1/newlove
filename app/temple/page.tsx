"use client";

import { useEffect, useState } from 'react';
import MicrophoneButton from '@/components/MicrophoneButton';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
// Removed framer-motion imports to reduce glitches

// --- CONFIG ---
const SERVICES = [
  { 
    id: 'vigil', 
    name: 'JOIN THE FLAME', 
    sub: 'LIGHT A CANDLE',
    path: '/vigil?mode=temple', 
    icon: '🕯',
    color: 'text-orange-500' 
  },
  { 
    id: 'letitgo', 
    name: 'BURN SECRET', 
    sub: 'INCINERATOR READY',
    path: '/heartandangel/letitgo?mode=temple', 
    icon: '🔥',
    color: 'text-red-500' 
  },
  { 
    id: 'absolution', 
    name: 'GET RECEIPT', 
    sub: 'TRANSACTIONAL',
    path: '/absolution?mode=temple', 
    icon: '🧾',
    color: 'text-white' 
  },
  { 
    id: 'cast', 
    name: 'WHO AM I?', 
    sub: 'PSYCHOMETRICS',
    path: '/cast?mode=temple', 
    icon: '💀',
    color: 'text-zinc-400' 
  }
];

export default function TemplePage() {
  const router = useRouter();
  const [userName, setUserName] = useState('Pilgrim');
  const [dbHearts, setDbHearts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]); // For the ticker

  const supabase = createClient();

  // --- REALTIME DATA ---
  const activeFlames = dbHearts.filter(h => h?.last_lit_at && (Date.now() - new Date(h.last_lit_at).getTime()) < 24 * 60 * 60 * 1000).length;

  // --- AUTH & INIT ---
  useEffect(() => {
    // 1. Telegram Init
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
        if (user) setUserName(user.first_name || 'Pilgrim');
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

    // 3. Fetch Recent Logs (Last 10 events) for Ticker
    const fetchLogs = async () => {
        const { data } = await supabase
            .from('temple_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
        if (data) setLogs(data);
    };
    fetchLogs();

    // 4. Subscribe to changes
    const channel = supabase
      .channel('temple_dashboard_v4')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, () => fetchHearts())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temple_logs' }, (payload) => {
          setLogs(prev => [payload.new, ...prev].slice(0, 10));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleNav = (path: string) => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    router.push(path);
  };

  // Format logs for ticker
  const tickerText = logs.length > 0 
    ? logs.map(l => `[${new Date(l.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}] ${l.message}`).join('  +++  ')
    : "THE TEMPLE WAITS FOR YOU ... SILENCE IS CURRENCY ...";

  return (
    <div className="fixed inset-0 bg-black text-white font-mono flex flex-col overflow-hidden selection:bg-white selection:text-black">
      
      {/* 
         CRITICAL FIX: Hide global Header/Footer on this page specifically.
         We use 'fixed inset-0' to cover everything, but just in case, we hide potential sticky headers.
      */}
      <style jsx global>{`
        header, footer { display: none !important; } /* Hide global site layout */
        .temple-root-header { display: flex !important; } /* Show local header */
        .temple-root-footer { display: flex !important; } /* Show local footer */
        
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
        .animate-marquee { animation: marquee 40s linear infinite; }
        
        .grid-btn:active { transform: scale(0.98); border-color: #666; }
      `}</style>

      {/* --- LOCAL HEADER --- */}
      <header className="temple-root-header h-16 shrink-0 flex justify-between items-end px-6 pb-4 border-b border-white/10 z-20 bg-black/50 backdrop-blur-sm">
        <div>
            <h1 className="text-2xl font-serif font-bold tracking-[0.1em] leading-none">TEMPLE</h1>
            <div className="text-[9px] text-zinc-500 tracking-[0.3em] uppercase mt-1">Bureau of Silence</div>
        </div>
        <div className="text-[9px] text-zinc-600 text-right">
            <div>{userName}</div>
            <div className="tracking-widest">PROTOCOL v.4.2</div>
        </div>
      </header>

      {/* --- MAIN CONTENT (CENTERED) --- */}
      <main className="flex-1 flex flex-col items-center justify-center w-full px-6 z-10 gap-6 overflow-y-auto">
        
        {/* 2x2 GRID - Made buttons brighter/clearer */}
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm aspect-square">
            {SERVICES.map((s) => (
                <button 
                    key={s.id}
                    onClick={() => handleNav(s.path)}
                    className="grid-btn group relative bg-[#0A0A0A] border border-white/10 hover:border-white/40 hover:bg-[#111] transition-all duration-200 flex flex-col items-center justify-center p-4 rounded-sm shadow-[0_0_15px_rgba(0,0,0,0.5)]"
                >
                    {/* ICON / WIDGET */}
                    <div className="mb-3 text-3xl filter grayscale group-hover:grayscale-0 transition-all duration-300">
                        {s.id === 'vigil' ? (
                            <div className="flex gap-1 items-center h-8">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < activeFlames ? 'bg-orange-500 shadow-[0_0_6px_orange]' : 'bg-zinc-800'}`} />
                                ))}
                            </div>
                        ) : (
                            s.icon
                        )}
                    </div>

                    {/* LABELS */}
                    <div className="text-center">
                        <div className={`text-[10px] font-bold tracking-widest ${s.color} opacity-80 group-hover:opacity-100`}>
                            {s.name}
                        </div>
                        <div className="text-[7px] text-zinc-600 mt-1 uppercase tracking-wider group-hover:text-zinc-400">
                            {s.sub}
                        </div>
                    </div>
                </button>
            ))}
        </div>

        {/* --- THE WHISPER (Bottom Center) --- */}
        <div className="w-full max-w-sm flex flex-col items-center gap-4 mt-2">
            <div className="text-[8px] text-zinc-700 tracking-[0.4em] uppercase">
                I am listening
            </div>
            
            <div className="relative group">
                <div className="absolute inset-0 bg-white/5 rounded-full blur-xl opacity-0 group-hover:opacity-20 transition-opacity" />
                <div className="relative bg-black border border-zinc-800 rounded-full p-1 hover:border-zinc-500 transition-all scale-125 active:scale-110">
                    <MicrophoneButton /> 
                </div>
            </div>
        </div>

      </main>

      {/* --- FOOTER: REAL LOGS TICKER --- */}
      <footer className="temple-root-footer h-10 bg-[#050505] border-t border-zinc-900 flex items-center overflow-hidden z-20 shrink-0">
        <div className="whitespace-nowrap animate-marquee flex gap-12 text-[9px] font-mono text-zinc-500 uppercase tracking-widest px-4">
            {tickerText}
        </div>
      </footer>

    </div>
  );
}