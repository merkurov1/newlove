'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Clock, Sparkles } from 'lucide-react';
import Header from '@/components/Header';

const ANGEL_GIF = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';
const FLAME_ID = 1;

export default function VigilPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, profile, isLoading } = useAuth();

  const angelRef = useRef<HTMLDivElement>(null);
  const fireRef = useRef<HTMLDivElement>(null);

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
      .channel('vigil_v5')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, (payload: any) => {
        const newRow = payload?.new;
        if (newRow && newRow.id === FLAME_ID) {
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
        const msg: string = row?.message || '';
        const m = msg.match(/^(.+?)\s+(sent|lit|ignited|added)/i);
        if (m && m[1]) names.push(m[1].trim());
        else if (msg) names.push(msg.slice(0, 24));
      });

      const unique = Array.from(new Set(names));
      setGuardians(unique.slice(0, 6));
      return unique.length;
    } catch {
      return 0;
    }
  };

  const updateTimer = () => {
    if (!flameData?.last_lit_at) return;
    const diff = Date.now() - new Date(flameData.last_lit_at).getTime();
    const remaining = 24 * 60 * 60 * 1000 - diff;
    
    if (remaining <= 0) setTimeLeft('EXTINGUISHED');
    else {
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      setTimeLeft(`${h}h ${m}m`);
    }
  };

  const triggerRitual = async () => {
    if (isLighting || !userName) return;
    setIsLighting(true);
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
      
      await supabase.from('temple_log').insert({
        message: `${userName} sent a spark`,
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
      
      {/* Глобальный хедер сайта */}
      <Header />

      {/* Фоновое сияние */}
      <div 
        className="absolute inset-0 transition-opacity duration-1000 pointer-events-none mt-20"
        style={{ 
          background: `radial-gradient(circle at center, rgba(255,100,0,${0.18 * intensity}) 0%, rgba(10,10,10,1) 80%)` 
        }} 
      />

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 pt-32 pb-24 flex flex-col items-center justify-between relative z-10">
        
        {/* Верхняя инфо-панель */}
        <div className="w-full flex justify-between items-center border-b border-white/10 pb-4">
          <button 
            onClick={() => router.push('/temple')} 
            className="text-xs uppercase tracking-widest text-zinc-400 hover:text-white transition-colors flex items-center gap-2"
          >
            ← Back to Sanctuary
          </button>
          <div className="text-right flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
            <Clock size={12} className="text-orange-500" />
            <span className="text-[10px] uppercase tracking-widest text-zinc-400">Heart Active:</span>
            <span className="text-xs font-bold text-white">{timeLeft || 'Loading...'}</span>
          </div>
        </div>

        {/* Основной визуальный блок: Ангелочек и Сердце/Пламя по центру */}
        <div className="w-full py-12 flex flex-col md:flex-row items-center justify-center gap-12 relative">
          
          {/* Крупный ангел с динамическим свечением */}
          <div 
            ref={angelRef}
            className="relative w-40 h-40 md:w-48 md:h-48 flex items-center justify-center shrink-0"
          >
            <div className={`absolute inset-0 bg-orange-500/20 blur-3xl rounded-full transition-all duration-700 ${isLighting ? 'opacity-100 scale-150' : 'opacity-40'}`} />
            <img 
              src={ANGEL_GIF} 
              className={`w-full h-full object-contain filter contrast-125 transition-all duration-500 ${isLighting ? 'brightness-150 scale-110 drop-shadow-[0_0_30px_rgba(255,165,0,0.9)]' : 'brightness-90'}`} 
              alt="Angel" 
            />
          </div>

          {/* Центральное пламя / Сердце */}
          <div className="relative flex items-center justify-center" ref={fireRef}>
            <div 
              className="relative transition-all duration-[2000ms] ease-in-out"
              style={{ transform: `scale(${Math.max(1, intensity * 0.9)})` }}
            >
              <motion.div 
                animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2.2, repeat: Infinity }}
                className="w-44 h-44 bg-gradient-to-t from-orange-600 via-red-600 to-transparent rounded-full blur-[45px] opacity-80 mix-blend-screen"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Flame size={88} className="text-white fill-orange-500/30 drop-shadow-[0_0_35px_rgba(255,140,0,0.8)]" />
              </div>
            </div>

            {/* Анимация искры, летящей от ангела к сердцу */}
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
                    scale: [1.5, 1, 0.4] 
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
          
          <div className="text-center space-y-1 bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md">
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Last Guardian</div>
            <div className="text-lg font-serif font-bold text-white drop-shadow-md">
              {lastGuardian}
            </div>
          </div>

          {/* Список недавних хранителей */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 text-center">Active Guardians (24h)</div>
            <div className="flex flex-wrap gap-2 justify-center">
              {guardians.length === 0 ? (
                <div className="text-xs text-zinc-500">No recent guardians</div>
              ) : (
                guardians.map((g, i) => (
                  <div key={g + i} className="text-xs px-3 py-1 bg-white/10 border border-white/5 rounded-full text-zinc-200">
                    {g}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Кнопка отправки искры и статус авторизации через сайт */}
          <div className="space-y-3 pt-2">
            <div className="text-center text-xs text-zinc-400">
              {isLoading ? (
                <span className="text-zinc-500">Checking session...</span>
              ) : userName ? (
                <div>Authenticated as <span className="font-semibold text-white">{userName}</span></div>
              ) : (
                <div className="text-amber-400/90 flex items-center justify-center gap-1.5">
                  <Sparkles size={14} />
                  <span>Please <a href="/login" className="underline hover:text-white">sign in</a> to send your spark</span>
                </div>
              )}
            </div>

            <button 
              onClick={triggerRitual}
              disabled={isLighting || !userName}
              className={`
                group relative w-full h-14 border border-white/20 bg-white/10 
                flex items-center justify-center gap-3 rounded-xl
                transition-all active:scale-95 hover:bg-white/20 disabled:opacity-40
              `}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 rounded-xl" />
              <Flame size={16} className={`text-orange-500 ${isLighting ? 'animate-bounce' : ''}`} />
              <span className="text-xs font-bold tracking-[0.25em] uppercase text-white">
                {isLighting ? 'TRANSMITTING SPARK...' : 'SEND SPARK'}
              </span>
            </button>

            {rateLimitMsg && (
              <div className="text-xs text-rose-400 text-center">{rateLimitMsg}</div>
            )}
          </div>

        </div>

      </main>
    </div>
  );
}
