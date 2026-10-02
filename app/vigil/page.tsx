'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Clock, Sparkles, Volume2, Radio, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const ANGEL_GIF = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';
const FLAME_ID = 1;
const ASSETS = {
  ambientAudio: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Drift%20of%20Glass.mp3',
};

function getTimeLighting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) {
    return {
      bg: 'bg-[#F5F2EB]',
      text: 'text-stone-900',
      subText: 'text-stone-600',
      navHover: 'hover:text-black',
      glow: 'from-amber-200/40 via-orange-100/20 to-transparent',
      vignette: 'radial-gradient(circle at 50% 30%, rgba(255, 243, 224, 0.7) 0%, rgba(245, 242, 235, 1) 85%)',
      cardBg: 'bg-white/80 border-stone-200 text-stone-900 shadow-xl'
    };
  } else if (hour >= 11 && hour < 17) {
    return {
      bg: 'bg-[#FAF8F5]',
      text: 'text-stone-900',
      subText: 'text-stone-600',
      navHover: 'hover:text-black',
      glow: 'from-stone-200/50 via-transparent to-transparent',
      vignette: 'radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.9) 0%, rgba(250, 248, 245, 1) 90%)',
      cardBg: 'bg-white/90 border-stone-200 text-stone-900 shadow-xl'
    };
  } else if (hour >= 17 && hour < 21) {
    return {
      bg: 'bg-[#1f1a18]',
      text: 'text-stone-100',
      subText: 'text-stone-300',
      navHover: 'hover:text-white',
      glow: 'from-orange-900/40 via-rose-950/20 to-transparent',
      vignette: 'radial-gradient(circle at 50% 40%, rgba(70, 35, 25, 0.5) 0%, rgba(31, 26, 24, 1) 90%)',
      cardBg: 'bg-stone-900/90 border-stone-800 text-stone-100 shadow-2xl'
    };
  } else {
    return {
      bg: 'bg-[#0b0c10]',
      text: 'text-stone-200',
      subText: 'text-stone-400',
      navHover: 'hover:text-white',
      glow: 'from-indigo-950/60 via-blue-950/20 to-transparent',
      vignette: 'radial-gradient(circle at 50% 30%, rgba(20, 25, 45, 0.6) 0%, rgba(11, 12, 16, 1) 90%)',
      cardBg: 'bg-zinc-900/90 border-zinc-800 text-zinc-100 shadow-2xl'
    };
  }
}

export default function VigilPage() {
  const supabase = createClient();
  const { user, profile, isLoading } = useAuth();

  const angelRef = useRef<HTMLDivElement | null>(null);
  const heartRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [intensity, setIntensity] = useState(1);
  const [timeLeft, setTimeLeft] = useState('');
  const [flameData, setFlameData] = useState<any>(null);
  const [guardians, setGuardians] = useState<string[]>([]);
  
  const [isLighting, setIsLighting] = useState(false);
  const [spark, setSpark] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [lighting, setLighting] = useState(getTimeLighting());

  const userName = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || '';

  useEffect(() => {
    setLighting(getTimeLighting());
    refreshData();

    const channel = supabase
      .channel('vigil_live_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, (payload: any) => {
        const newRow = payload?.new;
        if (newRow && newRow.id === FLAME_ID) {
          setFlameData(newRow);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temple_log' }, (payload: any) => {
        if (payload?.new?.event_type === 'vigil_spark') {
          calculateIntensity();
          refreshGuardians();
        }
      })
      .subscribe();

    const timer = setInterval(updateTimer, 1000);
    const lightTimer = setInterval(() => setLighting(getTimeLighting()), 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
      clearInterval(lightTimer);
    };
  }, []);

  useEffect(() => {
    updateTimer();
  }, [flameData]);

  const refreshData = async () => {
    const { data: flame } = await supabase.from('vigil_hearts').select('*').eq('id', FLAME_ID).maybeSingle();
    if (flame) {
      setFlameData(flame);
    }
    await calculateIntensity();
    await refreshGuardians();
  };

  const calculateIntensity = async () => {
    const uniqueCount = await refreshGuardians();
    let level = Math.min(10, Math.max(1, uniqueCount));
    setIntensity(level);
  };

  const refreshGuardians = async (): Promise<number> => {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('temple_log')
        .select('author, message, created_at')
        .eq('event_type', 'vigil_spark')
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

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => {});
    }
  };

  const triggerRitual = async () => {
    if (isLighting || !userName) return;
    setIsLighting(true);
    setRateLimitMsg(null);

    try {
      const { data: userLogs } = await supabase
        .from('temple_log')
        .select('created_at')
        .eq('event_type', 'vigil_spark')
        .eq('author', userName)
        .order('created_at', { ascending: false })
        .limit(1);

      if (userLogs && userLogs.length > 0) {
        const lastLitTime = new Date(userLogs[0].created_at).getTime();
        const diff = Date.now() - lastLitTime;
        const cooldownMs = 24 * 60 * 60 * 1000;

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
        event_type: 'vigil_spark',
        author: userName
      });
      
      setFlameData({ ...flameData, last_lit_at: nowISO });
    } catch (e) {
      console.error(e);
    }

    setTimeout(() => {
      setSpark(null);
      setIsLighting(false);
    }, 1200);
  };

  return (
    <main 
      className={`relative w-full min-h-[100dvh] ${lighting.bg} ${lighting.text} font-sans overflow-x-hidden select-none flex flex-col justify-between p-6 sm:p-12 transition-colors duration-1000`}
      style={{ backgroundImage: lighting.vignette }}
    >
      <audio ref={audioRef} src={ASSETS.ambientAudio} loop preload="auto" />

      {/* Верхняя панель: Кнопка Back to Temple и управление звуком */}
      <header className="relative z-50 flex flex-wrap justify-between items-center w-full max-w-7xl mx-auto pt-2 gap-4">
        <Link 
          href="/temple"
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full backdrop-blur-md border shadow-md transition-all text-xs font-serif tracking-wider cursor-pointer ${
            lighting.bg.includes('1f1a18') || lighting.bg.includes('0b0c10') 
              ? 'bg-white/10 border-white/20 text-stone-200 hover:bg-white/20' 
              : 'bg-white/80 border-stone-300 text-stone-900 hover:bg-white'
          }`}
        >
          <ArrowLeft size={14} />
          <span>Back to Temple</span>
        </Link>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleAudio}
            className={`flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md transition-all text-xs font-medium tracking-wide shadow-sm cursor-pointer ${
              lighting.bg.includes('1f1a18') || lighting.bg.includes('0b0c10') 
                ? 'bg-white/10 hover:bg-white/20 text-stone-200' 
                : 'bg-stone-200/60 hover:bg-stone-200 text-stone-800'
            }`}
          >
            {isPlayingAudio ? <Volume2 size={14} className="text-amber-400 animate-pulse" /> : <Radio size={14} />}
            <span>{isPlayingAudio ? 'Sound On' : 'Sound Off'}</span>
          </button>
        </div>
      </header>

      {/* Атмосферный фоновый свет */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-tr ${lighting.glow} blur-[120px] pointer-events-none transition-all duration-1000`} />

      {/* АНГЕЛ: Слева снизу (как герой в /temple) */}
      <div ref={angelRef} className="absolute left-[8%] bottom-[8%] sm:left-[15%] sm:bottom-[15%] z-30 flex flex-col items-center pointer-events-none">
        <div className="absolute -bottom-2 w-32 h-6 bg-black/25 rounded-full blur-[8px]" />
        <div className={`absolute inset-0 bg-amber-500/20 blur-3xl rounded-full transition-all duration-700 ${isLighting ? 'opacity-100 scale-150' : 'opacity-40'}`} />
        <div className="relative w-32 h-40 sm:w-44 sm:h-52 flex items-end justify-center drop-shadow-[0_20px_35px_rgba(0,0,0,0.3)]">
          <Image 
            src={ANGEL_GIF} 
            alt="Guardian Angel" 
            fill 
            className={`object-contain transition-all duration-500 ${isLighting ? 'brightness-125 scale-105 drop-shadow-[0_0_30px_rgba(255,165,0,0.8)]' : ''}`} 
            priority 
            unoptimized 
          />
        </div>
      </div>

      {/* СЕРДЦЕ: В правом верхнем углу (с отступами по 20% / адаптивно) */}
      <div ref={heartRef} className="absolute top-[12%] right-[10%] sm:top-[20%] sm:right-[20%] z-30 flex items-center justify-center">
        <div 
          className="relative transition-all duration-700 ease-in-out cursor-pointer"
          style={{ transform: `scale(${0.9 + (intensity / 10) * 0.4})` }}
        >
          <motion.div 
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.85, 0.5] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-32 h-32 sm:w-44 sm:h-44 bg-gradient-to-t from-orange-500 via-rose-500 to-transparent rounded-full blur-[45px] opacity-75 mix-blend-screen"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Heart 
              size={65 + intensity * 3} 
              className="text-white fill-orange-500/30 drop-shadow-[0_0_35px_rgba(255,140,0,0.8)] stroke-[1.5]" 
            />
          </div>
        </div>

        {/* Анимированная искра с траекторией полета */}
        <AnimatePresence>
          {spark && (
            <motion.div
              initial={{ 
                x: spark.start.x - spark.end.x, 
                y: spark.start.y - spark.end.y, 
                opacity: 0, 
                scale: 0.5 
              }}
              animate={{ 
                x: [0, (spark.end.x - spark.start.x) * 0.3, 0], 
                y: [0, -60, 0], 
                opacity: [0, 1, 1, 0], 
                scale: [0.8, 2, 1.2, 0.4] 
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: [0.25, 1, 0.5, 1] }}
              className="fixed z-50 pointer-events-none flex items-center justify-center"
              style={{ left: spark.start.x, top: spark.start.y }}
            >
              <div className="w-10 h-10 bg-amber-300 rounded-full blur-[3px] shadow-[0_0_30px_10px_#ff9900]" />
              <div className="absolute w-4 h-4 bg-white rounded-full shadow-[0_0_15px_4px_#ffffff]" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ЦЕНТР ЭКРАНА: Active Guardians (крупные, заметные) и элементы управления */}
      <div className="flex-1 max-w-xl mx-auto w-full py-16 sm:py-24 flex flex-col items-center justify-center relative z-20 gap-10 text-center my-auto">
        
        {/* Active Guardians — крупные и по центру экрана */}
        <div className="w-full space-y-4">
          <div className="font-mono text-xs uppercase tracking-[0.3em] opacity-70">Active Guardians (24h)</div>
          <div className="flex flex-wrap gap-3 justify-center items-center min-h-[50px] px-2">
            {guardians.length === 0 ? (
              <div className="font-serif text-sm opacity-50 italic">No recent sparks recorded yet. Be the first.</div>
            ) : (
              guardians.map((g, i) => (
                <div 
                  key={g + i} 
                  className={`font-serif text-sm sm:text-base px-4 py-2 rounded-2xl border shadow-md backdrop-blur-md transition-transform hover:scale-105 ${
                    lighting.bg.includes('1f1a18') || lighting.bg.includes('0b0c10')
                      ? 'bg-white/10 border-white/20 text-stone-100'
                      : 'bg-white/90 border-stone-300 text-stone-900'
                  }`}
                >
                  {g}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Статус сессии, таймер и кнопка Send Spark */}
        <div className="w-full max-w-md space-y-5 pt-4">
          <div className="text-center space-y-1.5">
            <div className="font-mono text-xs">
              {isLoading ? (
                <span className="opacity-50">Verifying session...</span>
              ) : userName ? (
                <div className="opacity-90">Connected as <span className="font-semibold">{userName}</span></div>
              ) : (
                <div className="text-amber-500 flex items-center justify-center gap-1.5">
                  <Sparkles size={14} />
                  <span>Please <Link href="/login" className="underline hover:opacity-80">sign in</Link> to participate</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-2">
              <Clock size={13} className="text-amber-500" />
              <span className="font-mono text-xs uppercase tracking-wider opacity-85">{timeLeft || 'Checking status...'}</span>
            </div>
          </div>

          <button 
            onClick={triggerRitual}
            disabled={isLighting || !userName}
            className={`
              group relative w-full h-16 border shadow-2xl
              flex items-center justify-center gap-3 rounded-2xl
              transition-all active:scale-95 disabled:opacity-40 cursor-pointer font-mono
              ${lighting.bg.includes('1f1a18') || lighting.bg.includes('0b0c10')
                ? 'bg-stone-100 text-stone-900 border-stone-200 hover:bg-white'
                : 'bg-stone-900 text-white border-stone-800 hover:bg-stone-800'
              }
            `}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 rounded-2xl" />
            <Heart size={18} className={`text-orange-500 fill-orange-500/30 ${isLighting ? 'animate-bounce' : ''}`} />
            <span className="text-xs font-bold tracking-[0.25em] uppercase">
              {isLighting ? 'TRANSMITTING SPARK...' : 'SEND SPARK'}
            </span>
          </button>

          {rateLimitMsg && (
            <div className="font-mono text-xs text-rose-500 text-center">{rateLimitMsg}</div>
          )}
        </div>

      </div>

      <div className="h-4" />
    </main>
  );
}
