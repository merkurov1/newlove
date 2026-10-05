'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/AuthContext';
import { useTempleAudio } from '../../components/AudioContext';
import SoundToggle from '../../components/SoundToggle';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Clock, Sparkles, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const ANGEL_GIF = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';
const FLAME_ID = 1;

// Постоянная тема темной комнаты / часовни
const roomTheme = {
  bg: 'bg-[#141210]',
  text: 'text-stone-200',
  subText: 'text-stone-400',
  glow: 'from-amber-900/40 via-orange-950/20 to-transparent',
  vignette: 'radial-gradient(circle at 50% 40%, rgba(55, 40, 32, 0.75) 0%, rgba(20, 18, 16, 1) 90%)',
  cardBg: 'bg-stone-900/90 border-stone-800/80 text-stone-100 shadow-2xl',
  buttonClass: 'bg-white/10 border-white/20 text-stone-200 hover:bg-white/20'
};

export default function VigilPage() {
  const supabase = createClient();
  const { user, profile, isLoading } = useAuth();
  const { isPlaying } = useTempleAudio();

  const angelRef = useRef<HTMLDivElement | null>(null);
  const heartRef = useRef<HTMLDivElement | null>(null);

  const [intensity, setIntensity] = useState(1);
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
      className={`relative w-full min-h-[100dvh] ${roomTheme.bg} ${roomTheme.text} font-sans overflow-x-hidden select-none flex flex-col justify-between p-6 sm:p-12 transition-colors duration-1000`}
      style={{ backgroundImage: roomTheme.vignette }}
    >
      <header className="relative z-50 grid grid-cols-3 items-center w-full max-w-7xl mx-auto pt-24 sm:pt-28 md:pt-32 px-2 sm:px-4">
        <div className="flex justify-start">
          <SoundToggle className={`px-3 sm:px-4 py-2 sm:py-2.5 border shadow-sm ${roomTheme.buttonClass}`} />
        </div>

        <div className="flex justify-center">
          <Link 
            href="/temple"
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-2.5 rounded-full backdrop-blur-md border shadow-md transition-all text-xs sm:text-sm font-serif tracking-wider hover:bg-white/20 cursor-pointer whitespace-nowrap ${roomTheme.buttonClass}`}
          >
            <ArrowLeft size={14} />
            <span>← Back</span>
            <span className="hidden sm:inline">to Temple</span>
          </Link>
        </div>

        <div />
      </header>

      {/* Мягкое внутреннее свечение в темной комнате */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-tr ${roomTheme.glow} blur-[120px] pointer-events-none`} />

      {/* Ангел в темной комнате */}
      <div ref={angelRef} className="absolute left-[8%] bottom-[8%] sm:left-[15%] sm:bottom-[15%] z-30 flex flex-col items-center pointer-events-none">
        <div className="absolute -bottom-2 w-32 h-6 bg-black/40 rounded-full blur-[10px]" />
        <div className={`absolute inset-0 bg-amber-600/15 blur-3xl rounded-full transition-all duration-700 ${isLighting ? 'opacity-100 scale-150' : 'opacity-40'}`} />
        <div className="relative w-32 h-40 sm:w-44 sm:h-52 flex items-end justify-center drop-shadow-[0_20px_35px_rgba(0,0,0,0.6)]">
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

      {/* Живое сердце на стене/в пространстве комнаты */}
      <div ref={heartRef} className="absolute top-[18%] right-[10%] sm:top-[22%] sm:right-[20%] z-30 flex items-center justify-center">
        <div 
          className="relative transition-all duration-700 ease-in-out cursor-pointer"
          style={{ transform: `scale(${0.9 + (intensity / 10) * 0.4})` }}
        >
          <motion.div 
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.75, 0.4] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-32 h-32 sm:w-44 sm:h-44 bg-gradient-to-t from-orange-600 via-rose-600 to-transparent rounded-full blur-[45px] opacity-75 mix-blend-screen"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Heart 
              size={65 + intensity * 3} 
              className="text-stone-100 fill-orange-600/30 drop-shadow-[0_0_35px_rgba(255,140,0,0.8)] stroke-[1.5]" 
            />
          </div>
        </div>

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

      {/* Центральный блок управления */}
      <div className="flex-1 max-w-md mx-auto w-full py-12 flex flex-col items-center justify-center relative z-25 my-auto">
        <div className={`w-full p-6 sm:p-8 rounded-3xl border backdrop-blur-xl ${roomTheme.cardBg} flex flex-col items-center gap-6 text-center shadow-2xl`}>
          
          <div className="w-full space-y-3">
            <div className="font-mono text-xs uppercase tracking-[0.3em] opacity-70">Active Guardians (24h)</div>
            <div className="flex flex-wrap gap-2 justify-center items-center min-h-[40px]">
              {guardians.length === 0 ? (
                <div className="font-serif text-sm opacity-50 italic">No recent sparks recorded yet. Be the first.</div>
              ) : (
                guardians.map((g, i) => (
                  <div 
                    key={g + i} 
                    className={`font-serif text-xs sm:text-sm px-3.5 py-1.5 rounded-full border shadow-sm transition-transform hover:scale-105 ${roomTheme.buttonClass}`}
                  >
                    {g}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="w-full h-[1px] bg-white/10" />

          <div className="w-full space-y-4">
            <div className="text-center space-y-1.5">
              <div className="font-mono text-xs">
                {isLoading ? (
                  <span className="opacity-50">Verifying session...</span>
                ) : userName ? (
                  <div className="opacity-90">Connected as <span className="font-semibold">{userName}</span></div>
                ) : (
                  <div className="text-amber-400 flex items-center justify-center gap-1.5">
                    <Sparkles size={14} />
                    <span>Please <Link href="/login" className="underline hover:opacity-80">sign in</Link> to participate</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-2">
                <Clock size={13} className="text-amber-400" />
                <span className="font-mono text-xs uppercase tracking-wider opacity-85">{timeLeft || 'Checking status...'}</span>
              </div>
            </div>

            <button 
              onClick={triggerRitual}
              disabled={isLighting || !userName}
              className={`
                group relative w-full h-12 border backdrop-blur-md shadow-md
                flex items-center justify-center gap-2.5 rounded-full
                transition-all active:scale-95 disabled:opacity-40 cursor-pointer font-serif text-xs tracking-widest uppercase
                ${roomTheme.buttonClass}
              `}
            >
              <Heart size={14} className={`text-orange-500 fill-orange-500/30 ${isLighting ? 'animate-bounce' : ''}`} />
              <span>
                {isLighting ? 'Transmitting Spark...' : 'Send Spark'}
              </span>
            </button>

            {rateLimitMsg && (
              <div className="font-mono text-xs text-rose-400 text-center">{rateLimitMsg}</div>
            )}
          </div>

        </div>
      </div>

      <div className="h-4" />
    </main>
  );
}
