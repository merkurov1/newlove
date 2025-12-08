"use client";

import React, { useState, useEffect } from "react";
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Flame, Clock, ArrowLeft, History, AlertCircle } from 'lucide-react';

const FLAME_ID = 1;
const FLAME_DURATION = 24 * 60 * 60 * 1000;

export default function VigilPage() {
  const router = useRouter();
  const supabase = createClient();

  const [flameData, setFlameData] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState("CONNECTING...");
  const [isExtinguished, setIsExtinguished] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLighting, setIsLighting] = useState(false);
  const [userName, setUserName] = useState("Pilgrim");
  const [debugError, setDebugError] = useState<string | null>(null); // Для отладки

  useEffect(() => {
    // 1. AGGRESSIVE TELEGRAM INIT (Retry logic)
    let attempts = 0;
    const initTg = () => {
      const tg = (window as any).Telegram?.WebApp;
      if (tg && tg.initDataUnsafe?.user) {
        setUserName(tg.initDataUnsafe.user.first_name);
        tg.ready();
        tg.expand();
        try {
            tg.setHeaderColor('#000000');
            tg.setBackgroundColor('#000000');
        } catch (e) {}
      } else {
        if (attempts < 10) {
          attempts++;
          setTimeout(initTg, 300); // Try again every 300ms
        }
      }
    };
    initTg();

    // 2. Data Fetch
    fetchData();

    // 3. Realtime
    const channel = supabase
      .channel('vigil_fix')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, (payload: any) => {
        // Narrow and guard payload.new to avoid TS2339 when shape is uncertain
        const newRow = payload?.new as { [key: string]: any } | undefined;
        if (newRow && newRow.id === FLAME_ID) {
            setFlameData(newRow);
            updateTimer(newRow);
            fetchLogs();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temple_log' }, () => fetchLogs())
      .subscribe();

    const timer = setInterval(() => updateTimer(flameData), 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, []); // Run once on mount

  const fetchData = async () => {
    try {
        // Fetch Flame
        const { data: flame, error: flameError } = await supabase
            .from('vigil_hearts')
            .select('*')
            .eq('id', FLAME_ID)
            .maybeSingle();
        
        if (flameError) throw flameError;
        
        if (flame) {
            setFlameData(flame);
            updateTimer(flame);
        } else {
            // Если записи нет, создадим "фейковую" локально, чтобы интерфейс ожил
            setDebugError("No Flame ID=1 found in DB");
            setFlameData({ last_lit_at: new Date().toISOString(), owner_name: 'System' });
        }

        fetchLogs();
    } catch (e: any) {
        console.error(e);
        setDebugError(e.message || "Connection Error");
    }
  };

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('temple_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3);
    if (data) setLogs(data);
  };

  const updateTimer = (data: any = flameData) => {
    if (!data?.last_lit_at) return;

    const now = new Date().getTime();
    const litTime = new Date(data.last_lit_at).getTime();
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
      
      // Optimistic Update (Immediate UI response)
      setFlameData({ ...flameData, last_lit_at: nowISO, owner_name: userName });
      setIsExtinguished(false);
      setTimeLeft("23:59:59");

      // DB Update
      const { error } = await supabase
        .from('vigil_hearts')
        .upsert({ 
            id: FLAME_ID, 
            owner_name: userName, 
            last_lit_at: nowISO, 
            intention: 'KEPT THE LIGHT' 
        });

      if (error) throw error;

      await supabase.from('temple_log').insert({
        message: `${userName} fueled the flame`,
        event_type: 'vigil'
      });
      
      fetchLogs();

    } catch (e: any) {
      setDebugError(`Write Error: ${e.message}`);
    } finally {
      setIsLighting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black text-white font-mono flex flex-col overflow-hidden selection:bg-orange-500/30">
      <style jsx global>{`header, footer { display: none !important; }`}</style>

      {/* HEADER */}
      <div className="relative z-20 h-20 flex justify-between items-start p-6">
        <button onClick={() => router.push('/temple')} className="text-zinc-500 hover:text-white">
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
        {/* Core Flame */}
        <div className="relative flex flex-col items-center justify-center">
            {isExtinguished ? (
                <Flame size={64} className="text-zinc-800" strokeWidth={1} />
            ) : (
                <div className="relative w-32 h-32 flex items-center justify-center">
                    <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full animate-pulse" />
                    <Flame size={80} className="text-white drop-shadow-[0_0_15px_rgba(255,100,0,0.8)] fill-orange-500/20 relative z-10" />
                </div>
            )}
            
            {/* Owner Name */}
            {!isExtinguished && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 text-center">
                    <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 mb-1">Guardian</div>
                    <div className="text-lg font-serif font-bold text-white">{flameData?.owner_name || userName}</div>
                </motion.div>
            )}
        </div>
      </div>

      {/* DEBUG MESSAGE (Если есть ошибки - покажем тут) */}
      {debugError && (
          <div className="absolute top-20 left-0 right-0 text-center">
              <span className="bg-red-900/80 text-white text-[10px] px-2 py-1 rounded border border-red-500">
                  DEBUG: {debugError}
              </span>
          </div>
      )}

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
                    <span className="uppercase tracking-wider">
                        {log.message?.toUpperCase()}
                    </span>
                    <span className="opacity-50 ml-auto">
                        {new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}