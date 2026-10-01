'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Clock, Sparkles, Flame } from 'lucide-react';
import Header from '@/components/Header';

const ANGEL_GIF = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';
const FLAME_ID = 1;

export default function VigilPage() {
  const supabase = createClient();
  const { user, profile, isLoading } = useAuth();

  const angelRef = useRef<HTMLDivElement>(null);
  const heartRef = useRef<HTMLDivElement>(null);

  const [intensity, setIntensity] = useState(1);
  const [lastGuardian, setLastGuardian] = useState('Loading...');
  const [timeLeft, setTimeLeft] = useState('');
  const [flameData, setFlameData] = useState<any>(null);
  const [guardians, setGuardians] = useState<string[]>([]);
  
  const [isLighting, setIsLighting] = useState(false);
  const [spark, setSpark] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);

  const userName = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || '';

  useEffect(() => {
    refreshData();

    const channel = supabase
      .channel('vigil_live_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, (payload: any) => {
        const newRow = payload?.new;
        if (newRow && newRow.id === FLAME_ID) {
          setFlameData(newRow);
          if (newRow.owner_name) setLastGuardian(newRow.owner_name);
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
    updateTimer();
  }, [flameData]);

  const refreshData = async () => {
    const { data: flame } = await supabase.from('vigil_hearts').select('*').eq('id', FLAME_ID).maybeSingle();
    if (flame) {
      setFlameData(flame);
      if (flame.owner_name) setLastGuardian(flame.owner_name);
    }
    await calculateIntensity();
    await refreshGuardians();
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
        .select('author, message, created_at')
        .eq('event_type', 'vigil')
        .gt('created_at', yesterday)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error || !data) return 0;

      const names: string[] = [];
      data.forEach((row: any) => {
        if (row.author) {
          names.push(row.author.trim());
        } else if (row.message) {
          const parts = row.message.split(' ');
          if (parts[0]) names.push(parts[0].trim());
        }
      });

      const unique = Array.from(new Set(names));
      setGuardians(unique.slice(0, 8));
      return unique.length;
    } catch {
      return 0;
    }
  };

  const updateTimer = () => {
    if (!flameData?.last_lit_at) return;
    const diff = Date.now() - new Date(flameData.last_lit_at).getTime();
    const remaining = 24 * 60 * 60 * 1000 - diff;
    
    if (remaining <= 0) {
      setTimeLeft('FLAME EXTINGUISHED');
    } else {
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      setTimeLeft(`${h}h ${m}m remaining`);
    }
  };

  const triggerRitual = async () => {
    if (isLighting || !userName) return;
    setIsLighting(true);
    setRateLimitMsg(null);

    try {
      // Строгая проверка суточного лимита (24 часа) для текущего пользователя
      const { data: userLogs } = await supabase
        .from('temple_log')
        .select('created_at')
        .eq('event_type', 'vigil')
        .eq('author', userName)
        .order('created_at', { ascending: false })
        .limit(1);

      if (userLogs && userLogs.length > 0) {
        const lastLitTime = new Date(userLogs[0].created_at).getTime();
        const diff = Date.now() - lastLitTime;
        const cooldownMs = 24 * 60 * 60 * 1000; // 24 часа

        if (diff < cooldownMs) {
          const remain = cooldownMs - diff;
          const h = Math.floor(remain / 3600000);
          const m = Math.floor((remain % 3600000) / 60000);
          setRateLimitMsg(`You can light the heart again in ${h}h ${m}m.`);
          setIsLighting(false);
          return;
        }
      }
    } catch (e) {
      console.error(e);
    }

    if (angelRef.current && heartRef.current) {
      const angelRect = angelRef.current.getBoundingClientRect();
      const heartRect = heartRef.current.getBoundingClientRect();
      
      setSpark({
        start: { x: angelRect.left + angelRect.width / 2, y: angelRect.top + angelRect.height / 2 },
        end: { x: heartRect.left + heartRect.width / 2, y: heartRect.top + heartRect.height / 2 }
      });
    }

    try {
      const nowISO = new Date().toISOString();
      await supabase.from('vigil_hearts').update({ 
        owner_name: userName, 
        last_lit_at: nowISO 
      }).eq('id', FLAME_ID);
      
      await supabase.from('temple_log').insert({
        message: `${userName} transmitted a spark`,
        event_type: 'vigil',
        author: userName
      });
      
      setLastGuardian(userName);
      setFlameData({ ...flameData, last_lit_at: nowISO });
    } catch (e) {
      console.error(e);
    }

    setTimeout(() => {
      setSpark(null);
      setIsLighting(false);
    }, 900);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-mono flex flex-col relative selection:bg-orange-500/30 overflow-x-hidden antialiased">
      
      <Header />

      {/* Динамический радиальный фон в зависимости от интенсивности пламени */}
      <div 
        className="absolute inset-0 transition-opacity duration-1000 pointer-events-none mt-24"
        style={{ 
          background: `radial-gradient(circle at center, rgba(255,100,0,${0.12 * intensity}) 0%, rgba(10,10,10,1) 75%)` 
        }} 
      />

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 pt-36 pb-20 flex flex-col items-center justify-between relative z-10">
        
        {/* Верхняя статусная панель */}
        <div className="w-full flex justify-between items-center border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Flame size={14} className="text-orange-500" />
            <span className="uppercase tracking-widest">Sanctuary Vigil [Level {intensity}]</span>
          </div>
          <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 px-3.5 py-1.5 rounded-full">
            <Clock size={12} className="text-orange-500" />
            <span className="text-[10px] uppercase tracking-widest text-zinc-400">Status:</span>
            <span className="text-xs font-bold text-white">{timeLeft || 'Checking...'}</span>
          </div>
        </div>

        {/* Основная композиция: Ангел со свечой и Священное Сердце */}
        <div className="w-full py-16 flex flex-col sm:flex-row items-center justify-center gap-12 sm:gap-20 relative">
          
          {/* Ангел с гифки */}
          <div 
            ref={angelRef}
            className="relative w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center shrink-0"
          >
            <div className={`absolute inset-0 bg-orange-500/15 blur-3xl rounded-full transition-all duration-700 ${isLighting ? 'opacity-100 scale-150' : 'opacity-40'}`} />
            <img 
              src={ANGEL_GIF} 
              className={`w-full h-full object-contain filter contrast-125 transition-all duration-500 ${isLighting ? 'brightness-150 scale-105 drop-shadow-[0_0_30px_rgba(255,165,0,0.8)]' : 'brightness-90'}`} 
              alt="Angel with candle" 
            />
          </div>

          {/* Центральное Сердце */}
          <div className="relative flex items-center justify-center" ref={heartRef}>
            <div 
              className="relative transition-all duration-700 ease-in-out"
              style={{ transform: `scale(${Math.max(1, 0.9 + intensity * 0.08)})` }}
            >
              <motion.div 
                animate={{ scale: [1, 1.12, 1], opacity: [0.6, 0.9, 0.6] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="w-40 h-40 sm:w-48 sm:h-48 bg-gradient-to-t from-orange-600 via-red-600 to-transparent rounded-full blur-[50px] opacity-75 mix-blend-screen"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Heart size={80} className="text-white fill-orange-500/25 drop-shadow-[0_0_30px_rgba(255,140,0,0.7)] stroke-[1.5]" />
              </div>
            </div>

            {/* Траектория искры от ангела к сердцу */}
            <AnimatePresence>
              {spark && (
                <motion.div
                  initial={{ 
                    x: spark.start.x - spark.end.x, 
                    y: spark.start.y - spark.end.y, 
                    opacity: 1, 
                    scale: 1.5 
                  }}
                  animate={{ 
                    x: 0, 
                    y: 0, 
                    opacity: [1, 1, 0], 
                    scale: [1.5, 1, 0.3] 
                  }}
                  transition={{ duration: 0.8, ease: 'easeInOut' }}
                  className="absolute z-50 w-5 h-5 bg-amber-200 rounded-full shadow-[0_0_30px_#ffaa00]"
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Блок информации и управления */}
        <div className="w-full max-w-md space-y-6">
          
          <div className="text-center space-y-1 bg-zinc-900/60 border border-zinc-800/80 p-5 rounded-3xl backdrop-blur-xl">
            <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Last Guardian</div>
            <div className="text-base font-serif font-normal text-white">
              {lastGuardian}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 text-center">Active Guardians (24h)</div>
            <div className="flex flex-wrap gap-2 justify-center min-h-[32px]">
              {guardians.length === 0 ? (
                <div className="text-xs text-zinc-600">No recent sparks recorded</div>
              ) : (
                guardians.map((g, i) => (
                  <div key={g + i} className="text-xs px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-300 font-sans">
                    {g}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="text-center text-xs text-zinc-400">
              {isLoading ? (
                <span className="text-zinc-600">Verifying session...</span>
              ) : userName ? (
                <div>Connected as <span className="font-semibold text-white">{userName}</span></div>
              ) : (
                <div className="text-amber-400/90 flex items-center justify-center gap-1.5">
                  <Sparkles size={14} />
                  <span>Please <a href="/login" className="underline hover:text-white">sign in</a> to participate in the vigil</span>
                </div>
              )}
            </div>

            <button 
              onClick={triggerRitual}
              disabled={isLighting || !userName}
              className={`
                group relative w-full h-14 border border-zinc-700 bg-zinc-900/90 
                flex items-center justify-center gap-3 rounded-2xl
                transition-all active:scale-95 hover:bg-zinc-800 disabled:opacity-40 cursor-pointer shadow-lg
              `}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 rounded-2xl" />
              <Heart size={16} className={`text-orange-500 fill-orange-500/20 ${isLighting ? 'animate-bounce' : ''}`} />
              <span className="text-xs font-bold tracking-[0.2em] uppercase text-white">
                {isLighting ? 'TRANSMITTING SPARK...' : 'SEND SPARK'}
              </span>
            </button>

            {rateLimitMsg && (
              <div className="text-xs text-rose-400 text-center font-sans">{rateLimitMsg}</div>
            )}
          </div>

        </div>

      </main>
    </div>
  );
}
