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
  
  // UX State
  const [isLighting, setIsLighting] = useState(false);
  const [spark, setSpark] = useState<{start:{x:number, y:number}, end:{x:number, y:number}} | null>(null);
  const [userName, setUserName] = useState("Pilgrim");

  useEffect(() => {
    // Telegram Init
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

    refreshData();

    // Realtime
    const channel = supabase
      .channel('vigil_v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, (payload: any) => {
        // Narrow and guard payload.new to avoid TS2339 when shape is uncertain
        const newRow = payload?.new as { [key: string]: any } | undefined;
        if (newRow && newRow.id === FLAME_ID) {
            setFlameData(newRow);
            setLastGuardian(newRow.owner_name);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temple_log' }, () => {
          // When log adds, refresh intensity
          calculateIntensity();
      })
      .subscribe();

    const timer = setInterval(updateTimer, 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
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
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
        .from('temple_log')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'vigil')
        .gt('created_at', yesterday);
    
    // Scale: 0 logs = size 1, 50 logs = size 3 (max)
    const raw = count || 0;
    const level = 1 + Math.min(raw / 10, 2); // 1.0 to 3.0
    setIntensity(level);
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

        {/* Button */}
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

      </div>
    </div>
  );
}