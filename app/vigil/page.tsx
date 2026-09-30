"use client";

import React, { useState, useEffect, useRef } from "react";
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, ArrowLeft, Clock } from 'lucide-react';

// --- ASSETS ---
const ANGEL_GIF = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';
const FLAME_ID = 1;

export default function VigilPage() {
  const router = useRouter();
  const supabase = createClient();

  // Refs for animation coordinates
  const angelRef = useRef<HTMLDivElement>(null);
  const fireRef = useRef<HTMLDivElement>(null);

  // Data State
  const [intensity, setIntensity] = useState(1); 
  const [lastGuardian, setLastGuardian] = useState("Loading...");
  const [timeLeft, setTimeLeft] = useState("");
  const [flameData, setFlameData] = useState<any>(null);
  const flameRef = useRef<any>(null);
  const [guardians, setGuardians] = useState<string[]>([]);
  
  // UX State
  const [isLighting, setIsLighting] = useState(false);
  const [spark, setSpark] = useState<{start:{x:number, y:number}, end:{x:number, y:number}} | null>(null);
  const [userName, setUserName] = useState("Pilgrim");
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    try {
      const local = window.localStorage.getItem('vigil_userName');
      if (local) setUserName(local);
    } catch (e) {}

    if (tg) {
      tg.ready();
      tg.expand();
      try {
        tg.setHeaderColor('#000000');
        tg.setBackgroundColor('#000000');
        const u = tg.initData?.user || tg.initDataUnsafe?.user;
        if (u?.first_name) {
          setUserName(u.first_name);
          try { window.localStorage.setItem('vigil_userName', u.first_name); } catch (e) {}
        }
      } catch (e) {}
    }
    
    refreshData();

    const channel = supabase
      .channel('vigil_v4')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, (payload: any) => {
        const newRow = payload?.new as { [key: string]: any } | undefined;
        if (newRow && newRow.id === FLAME_ID) {
            flameRef.current = newRow;
            setFlameData(newRow);
            setLastGuardian(newRow.owner_name || lastGuardian);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temple_log' }, () => {
          calculateIntensity();
          refreshGuardians();
      })
      .subscribe();

    const timer = setInterval(updateTimer, 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    flameRef.current = flameData;
    updateTimer();
  }, [flameData]);

  const refreshData = async () => {
    const { data: flame } = await supabase.from('vigil_hearts').select('*').eq('id', FLAME_ID).maybeSingle();
    if (flame) {
        setFlameData(flame);
        setLastGuardian(flame.owner_name);
    }
    calculateIntensity();
  };

  const calculateIntensity = async () => {
    const uniqueCount = await refreshGuardians();
    let level = 1;
    if (uniqueCount <= 0) level = 1;
    else if (uniqueCount < 5) level = 2;
    else if (uniqueCount < 10) level = 3;
    else if (uniqueCount < 15) level = 4;
    else level = 5;
    setIntensity(level);
  };

  const refreshGuardians = async (): Promise<number> => {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('temple_log')
        .select('message, created_at')
        .eq('event_type', 'vigil')
        .gt('created_at', yesterday)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) return 0;

      const names: string[] = [];
      (data || []).forEach((row: any) => {
        const msg: string = (row && row.message) || '';
        const m = msg.match(/^(.+?)\s+(sent|lit|ignited|added)/i);
        if (m && m[1]) names.push(m[1].trim());
        else if (msg) names.push(msg.slice(0, 24));
      });

      const unique = Array.from(new Set(names));
      setGuardians(unique.slice(0, 6));
      return unique.length;
    } catch (e) {
      return 0;
    }
  };

  const updateTimer = () => {
    if (!flameData?.last_lit_at) return;
    const diff = Date.now() - new Date(flameData.last_lit_at).getTime();
    const remaining = (24 * 60 * 60 * 1000) - diff;
    
    if (remaining <= 0) setTimeLeft("EXTINGUISHED");
    else {
        const h = Math.floor(remaining / (3600000));
        const m = Math.floor((remaining % 3600000) / 60000);
        setTimeLeft(`${h}h ${m}m`);
    }
  };

  const triggerRitual = async () => {
    if (isLighting) return;
    setIsLighting(true);

    if (!userName || userName === 'Pilgrim') {
      setRateLimitMsg('Please open this page in Telegram to authenticate');
      setIsLighting(false);
      return;
    }

    setRateLimitMsg(null);
    try {
      const check = await supabase
        .from('temple_log')
        .select('created_at')
        .eq('event_type', 'vigil')
        .ilike('message', `${userName} sent%`)
        .order('created_at', { ascending: false })
        .limit(1);

      const rows = (check.data as any[]) || [];
      if (rows.length > 0) {
        const last = new Date(rows[0].created_at).getTime();
        const diff = Date.now() - last;
        const limitMs = 3 * 60 * 60 * 1000;
        if (diff < limitMs) {
          const remain = limitMs - diff;
          const h = Math.floor(remain / 3600000);
          const m = Math.floor((remain % 3600000) / 60000);
          setRateLimitMsg(`You can light again in ${h}h ${m}m`);
          setIsLighting(false);
          return;
        }
      }
    } catch (e) {
      console.error(e);
    }

    // Вычисляем координаты для искры от крупного ангела к сердцу
    if (angelRef.current && fireRef.current) {
        const angelRect = angelRef.current.getBoundingClientRect();
        const fireRect = fireRef.current.getBoundingClientRect();
        
        setSpark({
            start: { x: angelRect.left + angelRect.width / 2, y: angelRect.top + angelRect.height / 2 },
            end: { x: fireRect.left + fireRect.width / 2, y: fireRect.top + fireRect.height / 2 }
        });
    }

    try {
        const nowISO = new Date().toISOString();
        await supabase.from('vigil_hearts').update({ 
            owner_name: userName, 
            last_lit_at: nowISO 
        }).eq('id', FLAME_ID);
        
        // Добавление лога события в общий поток Храма
        await supabase.from('temple_log').insert({
            message: `${userName} sent a spark`,
            event_type: 'vigil',
            author: userName
        });
        
        setLastGuardian(userName);
        setFlameData({...flameData, last_lit_at: nowISO});
    } catch (e) { 
      console.error(e); 
    }

    setTimeout(() => {
        setSpark(null);
        setIsLighting(false);
        const tg = (window as any).Telegram?.WebApp;
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    }, 900);
  };

  return (
    <div className="fixed inset-0 bg-black text-white font-mono flex flex-col overflow-hidden selection:bg-orange-500/30">
      <style jsx global>{`header, footer { display: none !important; }`}</style>

      {/* AMBIENT BACKGROUND */}
      <div 
        className="absolute inset-0 transition-opacity duration-1000 pointer-events-none"
        style={{ 
            background: `radial-gradient(circle at center, rgba(255,100,0,${0.15 * intensity}) 0%, rgba(0,0,0,1) 75%)` 
        }} 
      />

      {/* HEADER */}
      <div className="relative z-20 h-20 flex justify-between items-start p-6">
        <button onClick={() => router.push('/temple')} className="text-zinc-500 hover:text-white p-2">
            <ArrowLeft size={20} />
        </button>
        <div className="text-right flex flex-col items-end">
            <div className="text-[9px] tracking-[0.2em] text-zinc-500 uppercase flex items-center gap-1">
                <Clock size={10} /> Time Left (24h)
            </div>
            <div className="text-sm font-bold text-zinc-300">{timeLeft}</div>
        </div>
      </div>

      {/* THE ANGEL (Increased size and prominence) */}
      <div 
        ref={angelRef}
        className="absolute top-20 right-6 z-30 w-32 h-32 md:w-36 md:h-36 opacity-90 pointer-events-none"
      >
        <div className={`absolute inset-0 bg-orange-500/20 blur-2xl rounded-full transition-opacity duration-500 ${isLighting ? 'opacity-100 scale-125' : 'opacity-0'}`} />
        <img 
            src={ANGEL_GIF} 
            className={`w-full h-full object-contain contrast-125 transition-all duration-300 ${isLighting ? 'brightness-150 scale-110 drop-shadow-[0_0_25px_rgba(255,165,0,0.8)]' : 'brightness-90'}`} 
            alt="Angel" 
        />
      </div>

      {/* THE HEART / FIRE (Center) */}
      <div className="flex-1 relative flex items-center justify-center z-10 w-full" ref={fireRef}>
        <div 
            className="relative transition-all duration-[2000ms] ease-in-out"
            style={{ transform: `scale(${intensity})` }}
        >
            <motion.div 
                animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2.2, repeat: Infinity }}
                className="w-40 h-40 bg-gradient-to-t from-orange-600 via-red-600 to-transparent rounded-full blur-[40px] opacity-80 mix-blend-screen"
            />
            <div className="absolute inset-0 flex items-center justify-center">
                <Flame size={76} className="text-white fill-orange-500/30 drop-shadow-[0_0_30px_rgba(255,140,0,0.7)]" />
            </div>
        </div>

        {/* DYNAMIC SPARK FLIGHT ANIMATION */}
        <AnimatePresence>
            {spark && (
                <motion.div
                    initial={{ 
                      x: spark.start.x - window.innerWidth / 2, 
                      y: spark.start.y - window.innerHeight / 2, 
                      opacity: 1, 
                      scale: 1.5 
                    }}
                    animate={{ 
                      x: 0, 
                      y: 0, 
                      opacity: [1, 1, 0], 
                      scale: [1.5, 1, 0.4] 
                    }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                    className="absolute z-50 w-4 h-4 bg-amber-200 rounded-full shadow-[0_0_25px_#ffaa00]"
                />
            )}
        </AnimatePresence>
      </div>

      {/* CONTROLS & GUARDIANS */}
      <div className="relative z-30 pb-12 pt-4 px-8 flex flex-col items-center gap-6">
        
        <div className="text-center space-y-1">
            <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-500">Last Guardian</div>
            <div className="text-lg font-serif font-bold text-white drop-shadow-md">
                {lastGuardian}
            </div>
        </div>

        {/* Recent Guardians list */}
        <div className="w-full max-w-md">
          <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 mb-2 text-center">Active Guardians (24h)</div>
          <div className="flex flex-wrap gap-2 justify-center">
            {guardians.length === 0 ? (
              <div className="text-xs text-zinc-500">No recent guardians</div>
            ) : (
              guardians.map((g, i) => (
                <div key={g + i} className="text-xs px-2.5 py-1 bg-white/10 border border-white/5 rounded-full text-zinc-200">
                  {g}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="w-full max-w-md">
          <div className="mb-3 text-center text-xs text-zinc-400">
            {userName && userName !== 'Pilgrim' ? (
              <div>Authenticated as <span className="font-semibold text-white">{userName}</span></div>
            ) : (
              <div className="text-zinc-500">Open in Telegram to send your spark</div>
            )}
          </div>

          <button 
            onClick={triggerRitual}
            disabled={isLighting || !userName || userName === 'Pilgrim'}
            className={`
              group relative w-full h-15 border border-white/20 bg-white/5 
              flex items-center justify-center gap-3 rounded-xl
              transition-all active:scale-95 hover:bg-white/10 disabled:opacity-40
            `}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 rounded-xl" />
            <Flame size={16} className={`text-orange-500 ${isLighting ? 'animate-bounce' : ''}`} />
            <span className="text-xs font-bold tracking-[0.25em] uppercase text-white">
              {isLighting ? "TRANSMITTING SPARK..." : "SEND SPARK"}
            </span>
          </button>

          {rateLimitMsg && (
            <div className="text-xs text-rose-400 mt-2 text-center">{rateLimitMsg}</div>
          )}
        </div>

      </div>
    </div>
  );
}
