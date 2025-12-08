"use client";

import React, { useState, useEffect } from "react";
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Flame, Clock, ArrowLeft, History } from 'lucide-react';

// --- CONSTANTS ---
const FLAME_ID = 1;
const FLAME_DURATION = 24 * 60 * 60 * 1000; // 24h

export default function VigilPage() {
  const router = useRouter();
  const supabase = createClient();

  // State
  const [flameData, setFlameData] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState("LOADING...");
  const [isExtinguished, setIsExtinguished] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLighting, setIsLighting] = useState(false);
  const [userName, setUserName] = useState("Pilgrim");

  // --- INIT ---
  useEffect(() => {
    // 1. Telegram
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      try {
        tg.setHeaderColor('#000000');
        tg.setBackgroundColor('#000000');
        const u = tg.initDataUnsafe?.user;
        if (u?.first_name) setUserName(u.first_name);
      } catch (e) {}
    }

    // 2. Data
    fetchFlame();
    fetchLogs();

    // 3. Realtime
    const channel = supabase
      .channel('vigil_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, (payload: any) => {
        // Supabase realtime payload types can be loose — guard and narrow safely.
        const newRow = payload?.new as { [key: string]: any } | undefined;
        if (newRow && newRow.id === FLAME_ID) {
            setFlameData(newRow);
            fetchLogs(); 
        }
      })
      // ВАЖНО: Слушаем temple_log (единственное число)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temple_log' }, () => {
          fetchLogs();
      })
      .subscribe();

    // 4. Timer
    const interval = setInterval(updateTimer, 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [flameData]);

  // --- LOGIC ---
  const fetchFlame = async () => {
    const { data } = await supabase.from('vigil_hearts').select('*').eq('id', FLAME_ID).maybeSingle();
    if (data) setFlameData(data);
  };

  const fetchLogs = async () => {
    // ВАЖНО: Читаем из temple_log
    const { data } = await supabase.from('temple_log').select('*').order('created_at', { ascending: false }).limit(5);
    if (data) setLogs(data);
  };

  const updateTimer = () => {
    if (!flameData?.last_lit_at) return;

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

    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');

    try {
      const nowISO = new Date().toISOString();
      
      // 1. Update Flame
      const { error: heartError } = await supabase
        .from('vigil_hearts')
        .upsert({ id: FLAME_ID, owner_name: userName, last_lit_at: nowISO, intention: 'KEPT THE LIGHT' });

      if (heartError) throw heartError;

      // 2. Write Log (ВАЖНО: temple_log)
      await supabase.from('temple_log').insert({
        message: `${userName} fueled the flame`,
        metadata: { type: 'vigil' }
      });

      // 3. Optimistic Update
      setFlameData({ ...flameData, last_lit_at: nowISO, owner_name: userName });
      setIsExtinguished(false);

    } catch (e) {
      console.error("Ignite Error:", e);
    } finally {
      setIsLighting(false);
    }
  };

  // --- RENDER ---
  return (
    <div className="fixed inset-0 bg-black text-white font-mono flex flex-col overflow-hidden selection:bg-orange-500/30">
      <style jsx global>{`header, footer { display: none !important; }`}</style>

      {/* HEADER */}
      <div className="relative z-20 h-20 flex justify-between items-start p-6">
        <button onClick={() => router.push('/temple')} className="text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
        </button>
        <div className="text-right">
            <div className="flex items-center justify-end gap-2 text-orange-500/80 mb-1">
                <Clock size={12} className={!isExtinguished ? 'animate-pulse' : ''} />
                <span className="text-[10px] tracking-[0.2em] uppercase">Time Left</span>
            </div>
            <div className={`text-xl font-bold tracking-widest ${isExtinguished ? 'text-zinc-600' : 'text-white'}`}>
                {timeLeft}
            </div>
        </div>
      </div>

      {/* FLAME */}
      <div className="flex-1 relative flex items-center justify-center z-10 w-full">
        {/* Glow */}
        <motion.div 
            animate={{ opacity: isExtinguished ? 0.1 : [0.4, 0.6, 0.4] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute w-64 h-64 bg-orange-500/20 blur-[100px] rounded-full"
        />
        {/* Core */}
        <div className="relative">
            {isExtinguished ? (
                <Flame size={64} className="text-zinc-800" strokeWidth={1} />
            ) : (
                <div className="relative">
                    <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }} transition={{ duration: 2, repeat: Infinity }} className="w-32 h-32 bg-gradient-to-t from-orange-500 to-yellow-200 rounded-full blur-[20px] opacity-80 mix-blend-screen" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Flame size={80} className="text-white drop-shadow-lg fill-white/20" />
                    </div>
                </div>
            )}
        </div>
        
        {/* Owner Name */}
        {!isExtinguished && flameData?.owner_name && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-10 text-center">
                <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 mb-1">Guardian</div>
                <div className="text-lg font-serif font-bold text-white">{flameData.owner_name}</div>
            </motion.div>
        )}
      </div>

      {/* FOOTER */}
      <div className="relative z-20 bg-gradient-to-t from-zinc-950 to-transparent pt-10 pb-8 px-6 flex flex-col gap-6">
        <button 
            onClick={handleIgnite}
            disabled={isLighting}
            className={`w-full h-16 rounded-sm border flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs font-bold transition-all active:scale-95 ${isLighting ? 'bg-orange-500 border-orange-500 text-black' : 'bg-zinc-900/50 border-orange-500/30 text-orange-500'}`}
        >
            {isLighting ? "IGNITING..." : (isExtinguished ? "REIGNITE THE FLAME" : "FUEL THE FLAME")}
        </button>

        <div className="flex flex-col gap-2 h-16 overflow-hidden">
            {logs.map((log) => (
                <div key={log.id} className="flex items-center gap-2 text-[9px] text-zinc-400">
                    <History size={8} />
                    <span className="uppercase tracking-wider">{log.message}</span>
                    <span className="opacity-50">{new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}