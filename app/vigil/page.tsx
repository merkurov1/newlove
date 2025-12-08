"use client";

import React, { useState, useEffect } from "react";
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Clock, ArrowLeft, History } from 'lucide-react';

// --- CONSTANTS ---
const FLAME_ID = 1; // Мы используем ID=1 как единственный "Вечный Огонь"
const FLAME_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export default function VigilPage() {
  const router = useRouter();
  const supabase = createClient();

  // State
  const [loading, setLoading] = useState(true);
  const [flameData, setFlameData] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState("LOADING...");
  const [isExtinguished, setIsExtinguished] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLighting, setIsLighting] = useState(false);
  const [userName, setUserName] = useState("Pilgrim");

  // --- INIT ---
  useEffect(() => {
    // 1. Telegram Init
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      try {
        tg.setHeaderColor('#000000');
        tg.setBackgroundColor('#000000');
        if (tg.BackButton) {
            tg.BackButton.show();
            tg.BackButton.onClick(() => router.push('/temple'));
        }
        const u = tg.initDataUnsafe?.user;
        if (u?.first_name) setUserName(u.first_name);
      } catch (e) {}
    }

    // 2. Data Fetch
    fetchFlame();
    fetchLogs();

    // 3. Realtime Subscription
    const channel = supabase
      .channel('vigil_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, (payload: any) => {
        // Narrow payload.new safely — Supabase typings sometimes use a loose object type
        const newRow = payload?.new as any;
        if (newRow?.id === FLAME_ID) {
            setFlameData(newRow);
            fetchLogs(); // Refresh logs when flame updates
        }
      })
      .subscribe();

    // 4. Timer Loop
    const interval = setInterval(updateTimer, 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      if (tg?.BackButton) tg.BackButton.hide();
    };
  }, []);

  // --- LOGIC ---
  const fetchFlame = async () => {
    try {
      const { data, error } = await supabase
        .from('vigil_hearts')
        .select('*')
        .eq('id', FLAME_ID)
        .maybeSingle();

      if (error) console.error("DB Error:", error);
      
      // Если записи нет, создаем "холодную" запись в памяти
      if (!data) {
        setFlameData({ id: FLAME_ID, last_lit_at: null, owner_name: 'Nobody' });
      } else {
        setFlameData(data);
      }
      setLoading(false);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('temple_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setLogs(data);
  };

  const updateTimer = () => {
    if (!flameData?.last_lit_at) {
        setTimeLeft("EXTINGUISHED");
        setIsExtinguished(true);
        return;
    }

    const now = new Date().getTime();
    const litTime = new Date(flameData.last_lit_at).getTime();
    const diff = now - litTime;
    const remaining = FLAME_DURATION - diff;

    if (remaining <= 0) {
        setTimeLeft("EXTINGUISHED");
        setIsExtinguished(true);
    } else {
        setIsExtinguished(false);
        const h = Math.floor(remaining / (1000 * 60 * 60));
        const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((remaining % (1000 * 60)) / 1000);
        setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }
  };

  const handleIgnite = async () => {
    if (isLighting) return;
    setIsLighting(true);

    // Haptics
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');

    try {
      const nowISO = new Date().toISOString();
      
      // 1. Update Flame (Upsert ensures it works even if row missing)
      await supabase.from('vigil_hearts').upsert({
        id: FLAME_ID,
        owner_name: userName,
        last_lit_at: nowISO,
        intention: 'KEPT THE LIGHT'
      });

      // 2. Log History
      await supabase.from('temple_logs').insert({
        message: `${userName} fueled the flame`,
        metadata: { type: 'vigil' }
      });

      // Optimistic Update
      setFlameData({ ...flameData, last_lit_at: nowISO, owner_name: userName });
      setIsExtinguished(false);

    } catch (e) {
      console.error("Ignite failed:", e);
    } finally {
      setIsLighting(false);
    }
  };

  // --- RENDER ---
  return (
    <div className="fixed inset-0 bg-black text-white font-mono flex flex-col overflow-hidden selection:bg-orange-500/30">
      
      {/* Global Styles */}
      <style jsx global>{`
        header, footer { display: none !important; }
      `}</style>

      {/* --- HEADER --- */}
      <div className="relative z-20 h-20 flex justify-between items-start p-6">
        <button onClick={() => router.push('/temple')} className="text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
        </button>
        <div className="text-right">
            <div className="flex items-center justify-end gap-2 text-orange-500/80 mb-1">
                <Clock size={12} className={isExtinguished ? '' : 'animate-pulse'} />
                <span className="text-[10px] tracking-[0.2em] uppercase">Time Left</span>
            </div>
            <div className={`text-xl font-bold tracking-widest ${isExtinguished ? 'text-zinc-600' : 'text-white'}`}>
                {timeLeft}
            </div>
        </div>
      </div>

      {/* --- THE FLAME (PROCEDURAL) --- */}
      <div className="flex-1 relative flex items-center justify-center z-10 w-full">
        
        {/* Glow Layer */}
        <motion.div 
            animate={{ opacity: isExtinguished ? 0.1 : [0.4, 0.6, 0.4] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute w-64 h-64 bg-orange-500/20 blur-[100px] rounded-full"
        />

        {/* Core Flame (CSS Art) */}
        <div className="relative flex items-center justify-center">
            {isExtinguished ? (
                <div className="text-zinc-800 flex flex-col items-center gap-4">
                    <Flame size={64} strokeWidth={1} />
                    <span className="text-[10px] tracking-[0.3em] uppercase">The fire is dead</span>
                </div>
            ) : (
                <div className="relative">
                    {/* Inner Core */}
                    <motion.div
                        animate={{ 
                            scale: [1, 1.1, 1],
                            opacity: [0.8, 1, 0.8] 
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-32 h-32 bg-gradient-to-t from-orange-500 to-yellow-200 rounded-full blur-[20px] opacity-80 mix-blend-screen"
                    />
                    {/* Outer Plasma */}
                    <motion.div
                        animate={{ 
                            scale: [1.1, 1.3, 1.1], 
                            rotate: [0, 5, -5, 0] 
                        }}
                        transition={{ duration: 5, repeat: Infinity }}
                        className="absolute inset-0 bg-gradient-to-t from-red-600 to-orange-400 rounded-full blur-[40px] opacity-50 mix-blend-screen"
                    />
                    {/* Sparks (Simple) */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Flame size={80} className="text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] fill-white/20" />
                    </div>
                </div>
            )}
        </div>

        {/* Current Guardian Name */}
        {!isExtinguished && flameData?.owner_name && (
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-10 text-center"
            >
                <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 mb-1">Guardian</div>
                <div className="text-lg font-serif font-bold text-white drop-shadow-md">
                    {flameData.owner_name}
                </div>
            </motion.div>
        )}
      </div>

      {/* --- FOOTER: ACTION & HISTORY --- */}
      <div className="relative z-20 bg-gradient-to-t from-zinc-950 via-zinc-900/90 to-transparent pt-10 pb-8 px-6 flex flex-col gap-6">
        
        {/* ACTION BUTTON */}
        <button 
            onClick={handleIgnite}
            disabled={isLighting}
            className={`
                w-full h-16 rounded-sm border 
                flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs font-bold
                transition-all active:scale-95
                ${isLighting ? 'bg-orange-500 border-orange-500 text-black' : 'bg-zinc-900/50 border-orange-500/30 text-orange-500 hover:bg-orange-500/10'}
                shadow-[0_0_30px_rgba(249,115,22,0.1)]
            `}
        >
            {isLighting ? (
                <span className="animate-pulse">Igniting...</span>
            ) : (
                <>
                    <Flame size={16} className={isExtinguished ? '' : 'fill-current'} />
                    {isExtinguished ? "REIGNITE THE FLAME" : "FUEL THE FLAME"}
                </>
            )}
        </button>

        {/* LOGS (Small Ticker) */}
        <div className="h-12 overflow-hidden border-t border-white/5 pt-4">
            <div className="flex flex-col gap-2">
                {logs.map((log, i) => (
                    <motion.div 
                        key={log.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1 - (i * 0.3), x: 0 }}
                        className="flex items-center gap-2 text-[9px] text-zinc-400"
                    >
                        <History size={8} />
                        <span className="uppercase tracking-wider">
                            {log.message}
                        </span>
                        <span className="opacity-50">
                            {new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                    </motion.div>
                ))}
                {logs.length === 0 && (
                    <div className="text-[9px] text-zinc-600 text-center uppercase tracking-widest">
                        History is silent
                    </div>
                )}
            </div>
        </div>

      </div>
    </div>
  );
}