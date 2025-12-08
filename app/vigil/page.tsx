"use client";

import React, { useState, useEffect, useRef } from "react";
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, ArrowLeft, History, Clock } from 'lucide-react';

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
  const [intensity, setIntensity] = useState(1); // 1 to 5 scale based on activity
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
    // Telegram Init
    const tg = (window as any).Telegram?.WebApp;
    // Prefer locally-saved name to persist across anonymous WebApp sessions
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
        const u = tg.initDataUnsafe?.user;
        if (u?.first_name) {
          setUserName(u.first_name);
          try { window.localStorage.setItem('vigil_userName', u.first_name); } catch (e) {}
        }
      } catch (e) {}
    }
    // Initial load
    refreshData();

    // Realtime - subscribe ONCE on mount
    const channel = supabase
      .channel('vigil_v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, (payload: any) => {
        const newRow = payload?.new as { [key: string]: any } | undefined;
        if (newRow && newRow.id === FLAME_ID) {
            flameRef.current = newRow;
            setFlameData(newRow);
            setLastGuardian(newRow.owner_name || lastGuardian);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temple_log' }, (payload: any) => {
          // When a new vigil log appears, refresh intensity and guardians
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

  // keep flameRef in sync when flameData changes
  useEffect(() => {
    flameRef.current = flameData;
    // update timer immediately when flameData changes
    updateTimer();
  }, [flameData]);

  // --- LOGIC ---

  const refreshData = async () => {
    // 1. Get Flame Status
    const { data: flame } = await supabase.from('vigil_hearts').select('*').eq('id', FLAME_ID).maybeSingle();
    if (flame) {
        setFlameData(flame);
        setLastGuardian(flame.owner_name);
    }

    // 2. Calculate Intensity (Count logs in last 24h)
    calculateIntensity();
  };

  const calculateIntensity = async () => {
    // Use unique participant count (guardians) in last 24h to determine intensity
    const uniqueCount = await refreshGuardians();
    // Map unique participants to intensity scale 1..5
    // 0 -> 1, 1-4 -> 2, 5-9 -> 3, 10-14 -> 4, 15+ -> 5
    let level = 1;
    if (uniqueCount <= 0) level = 1;
    else if (uniqueCount < 5) level = 2;
    else if (uniqueCount < 10) level = 3;
    else if (uniqueCount < 15) level = 4;
    else level = 5;
    setIntensity(level);
  };

  // Refresh recent guardians (unique participant names) from temple_log
  // Returns the number of unique guardians found in the last 24h
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

      if (error) {
        console.error('refreshGuardians error', error);
        return 0;
      }

      const names: string[] = [];
      (data || []).forEach((row: any) => {
        const msg: string = (row && row.message) || '';
        // Try to parse patterns like "<Name> sent a spark"
        const m = msg.match(/^(.+?)\s+(sent|lit|ignited|added)/i);
        if (m && m[1]) names.push(m[1].trim());
        else if (msg) names.push(msg.slice(0, 24));
      });

      // unique preserving order (most recent first)
      const unique = Array.from(new Set(names));
      setGuardians(unique.slice(0, 6));
      return unique.length;
    } catch (e) {
      console.error(e);
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

    // Rate limit: allow one ritual per user every 3 hours (client-side guard)
    setRateLimitMsg(null);
    try {
      const check = await supabase
        .from('temple_log')
        .select('created_at')
        .eq('event_type', 'vigil')
        .ilike('message', `${userName} sent%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (check.error) console.error('rate check error', check.error);
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
      console.error('rate check failed', e);
    }

    // 1. Calculate Spark Path
    if (angelRef.current && fireRef.current) {
        const angelRect = angelRef.current.getBoundingClientRect();
        const fireRect = fireRef.current.getBoundingClientRect();
        
        setSpark({
            start: { x: angelRect.left + angelRect.width/2, y: angelRect.top + angelRect.height/2 },
            end: { x: fireRect.left + fireRect.width/2, y: fireRect.top + fireRect.height/2 }
        });
    }

    // 2. Database Action (in background)
    try {
        const nowISO = new Date().toISOString();
        await supabase.from('vigil_hearts').update({ 
            owner_name: userName, 
            last_lit_at: nowISO 
        }).eq('id', FLAME_ID);
        
        await supabase.from('temple_log').insert({
            message: `${userName} sent a spark`,
            event_type: 'vigil'
        });
        
        // Optimistic
        setLastGuardian(userName);
        setFlameData({...flameData, last_lit_at: nowISO});
        
    } catch (e) { console.error(e); }

    // 3. Cleanup Animation
    setTimeout(() => {
        setSpark(null);
        setIsLighting(false);
        // Haptic Impact when spark hits
        const tg = (window as any).Telegram?.WebApp;
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    }, 1000); // Spark flight time
  };

  // --- RENDER ---
  return (
    <div className="fixed inset-0 bg-black text-white font-mono flex flex-col overflow-hidden selection:bg-orange-500/30">
      <style jsx global>{`header, footer { display: none !important; }`}</style>

      {/* --- LAYER 1: AMBIENT BACKGROUND --- */}
      <div 
        className="absolute inset-0 transition-opacity duration-1000"
        style={{ 
            background: `radial-gradient(circle at center, rgba(255,100,0,${0.1 * intensity}) 0%, rgba(0,0,0,1) 70%)` 
        }} 
      />

      {/* --- LAYER 2: HEADER --- */}
      <div className="relative z-20 h-20 flex justify-between items-start p-6">
        <button onClick={() => router.push('/temple')} className="text-zinc-500 hover:text-white">
            <ArrowLeft size={20} />
        </button>
        <div className="text-right flex flex-col items-end">
            <div className="text-[9px] tracking-[0.2em] text-zinc-500 uppercase flex items-center gap-1">
                <Clock size={10} /> Time Left
            </div>
            <div className="text-sm font-bold text-zinc-300">{timeLeft}</div>
        </div>
      </div>

      {/* --- LAYER 3: THE ANGEL (Conduit) --- */}
      <div 
        ref={angelRef}
        className="absolute top-24 right-8 z-30 w-20 h-20 opacity-80"
      >
        {/* Halo Glow */}
        <div className={`absolute inset-0 bg-white/10 blur-xl rounded-full transition-opacity duration-500 ${isLighting ? 'opacity-100' : 'opacity-0'}`} />
        <img 
            src={ANGEL_GIF} 
            className={`w-full h-full object-contain grayscale contrast-125 transition-all duration-300 ${isLighting ? 'brightness-150 scale-110' : 'brightness-75'}`} 
            alt="Angel" 
        />
      </div>

      {/* --- LAYER 4: THE FIRE (Center) --- */}
      <div className="flex-1 relative flex items-center justify-center z-10 w-full" ref={fireRef}>
        <div 
            className="relative transition-all duration-[2000ms] ease-in-out"
            style={{ transform: `scale(${intensity})` }}
        >
            {/* Core procedural flame */}
            <motion.div 
                animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-32 h-32 bg-gradient-to-t from-orange-500 via-red-500 to-transparent rounded-full blur-[30px] opacity-80 mix-blend-screen"
            />
            <div className="absolute inset-0 flex items-center justify-center">
                <Flame size={64} className="text-white fill-white/20 drop-shadow-[0_0_20px_rgba(255,200,0,0.5)]" />
            </div>
        </div>

        {/* SPARK ANIMATION */}
        <AnimatePresence>
            {spark && (
                <motion.div
                    initial={{ x: spark.start.x - window.innerWidth/2, y: spark.start.y - window.innerHeight/2, opacity: 1, scale: 1 }}
                    animate={{ x: 0, y: 0, opacity: 0, scale: 0.5 }} // Moves to center (0,0 relative to flex center)
                    transition={{ duration: 0.8, ease: "circIn" }}
                    className="absolute z-50 w-3 h-3 bg-white rounded-full shadow-[0_0_15px_white]"
                />
            )}
        </AnimatePresence>
      </div>

      {/* --- LAYER 5: INFO & CONTROLS --- */}
      <div className="relative z-30 pb-12 pt-4 px-8 flex flex-col items-center gap-8">
        
        {/* Status */}
        <div className="text-center space-y-1">
            <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-600">Last Guardian</div>
            <div className="text-xl font-serif font-bold text-white drop-shadow-md">
                {lastGuardian}
            </div>
        </div>

        {/* Recent Guardians */}
        <div className="w-full max-w-md mt-2">
          <div className="text-[9px] uppercase tracking-[0.3em] text-zinc-600 mb-2">Recent Guardians</div>
          <div className="flex flex-wrap gap-2 justify-center">
            {guardians.length === 0 ? (
              <div className="text-xs text-zinc-500">No recent guardians</div>
            ) : (
              guardians.map((g, i) => (
                <div key={g + i} className="text-xs px-2 py-1 bg-white/6 rounded text-zinc-100">
                  {g}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Button */}
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 mb-3">
            <input
              value={userName}
              onChange={(e) => { setUserName(e.target.value); try { window.localStorage.setItem('vigil_userName', e.target.value); } catch (e) {} }}
              className="flex-1 bg-white/3 px-3 py-2 rounded text-sm"
              placeholder="Your name"
            />
            <button
              onClick={() => {
                // attempt to re-sync Telegram-provided user
                const tg = (window as any).Telegram?.WebApp;
                const u = tg?.initDataUnsafe?.user;
                if (u?.first_name) {
                  setUserName(u.first_name);
                  try { window.localStorage.setItem('vigil_userName', u.first_name); } catch (e) {}
                }
              }}
              className="px-3 py-2 text-xs bg-white/5 rounded"
            >Sync</button>
          </div>

          <button 
            onClick={triggerRitual}
            disabled={isLighting}
            className={`
              group relative w-full h-16 border border-white/10 bg-white/5 
              flex items-center justify-center gap-3 rounded-sm
              transition-all active:scale-95 hover:bg-white/10
            `}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            <Flame size={14} className={`text-orange-500 ${isLighting ? 'animate-bounce' : ''}`} />
            <span className="text-xs font-bold tracking-[0.2em] uppercase">
              {isLighting ? "TRANSMITTING..." : "SEND SPARK"}
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