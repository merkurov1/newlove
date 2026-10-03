'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAuth } from '@/components/AuthContext';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Flame,
  Radio,
  Volume2,
  Compass,
  ShieldCheck,
  Moon,
  Trash2,
  X,
  Users,
  Activity,
  Layers,
  Clock
} from 'lucide-react';
import Link from 'next/link';

const ASSETS = {
  angel: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png',
  daemon: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Daemon1.png',
  ambientAudio: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Drift%20of%20Glass.mp3',
};

interface TemplePost {
  id: string | number;
  type: string;
  label: string;
  author: string;
  time: string;
  content: string;
  audioUrl?: string | null;
  icon?: any;
  color?: string;
}

function getEventVisuals(eventType: string) {
  switch (eventType?.toUpperCase()) {
    case 'VIGIL':
    case 'VIGIL_SPARK':
      return { icon: Flame, color: 'text-amber-500', label: 'Vigil' };
    case 'ASH':
      return { icon: Trash2, color: 'text-rose-500', label: 'Let It Go' };
    case 'CAST':
      return { icon: Compass, color: 'text-indigo-400', label: 'Cast' };
    case 'ABSOLUTION':
      return { icon: ShieldCheck, color: 'text-emerald-400', label: 'Absolution' };
    case 'HEARTANDANGEL':
    case 'MEDITATION':
    case 'SILENCE':
      return { icon: Moon, color: 'text-purple-400', label: 'Calm' };
    case 'WHISPER':
      return { icon: Sparkles, color: 'text-amber-300', label: 'Whisper' };
    default:
      return { icon: Radio, color: 'text-stone-400', label: eventType || 'Log' };
  }
}

function formatTime(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

function getTimeLighting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) {
    return {
      bg: 'bg-[#F5F2EB]',
      text: 'text-stone-900',
      subText: 'text-stone-600',
      navHover: 'hover:text-black hover:scale-105',
      glow: 'from-amber-200/30 via-orange-100/10 to-transparent',
      vignette: 'radial-gradient(circle at 50% 30%, rgba(255, 243, 224, 0.6) 0%, rgba(245, 242, 235, 1) 80%)',
      cardBg: 'bg-white/95 border-stone-200 text-stone-900 shadow-2xl backdrop-blur-2xl'
    };
  } else if (hour >= 11 && hour < 17) {
    return {
      bg: 'bg-[#FAF8F5]',
      text: 'text-stone-900',
      subText: 'text-stone-600',
      navHover: 'hover:text-black hover:scale-105',
      glow: 'from-stone-200/40 via-transparent to-transparent',
      vignette: 'radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.8) 0%, rgba(250, 248, 245, 1) 85%)',
      cardBg: 'bg-white/95 border-stone-200 text-stone-900 shadow-2xl backdrop-blur-2xl'
    };
  } else if (hour >= 17 && hour < 21) {
    return {
      bg: 'bg-[#1f1a18]',
      text: 'text-stone-100',
      subText: 'text-stone-300',
      navHover: 'hover:text-white hover:scale-105',
      glow: 'from-orange-900/30 via-rose-950/20 to-transparent',
      vignette: 'radial-gradient(circle at 50% 40%, rgba(70, 35, 25, 0.4) 0%, rgba(31, 26, 24, 1) 90%)',
      cardBg: 'bg-stone-900/95 border-stone-800 text-stone-100 shadow-2xl backdrop-blur-2xl'
    };
  } else {
    return {
      bg: 'bg-[#0b0c10]',
      text: 'text-stone-200',
      subText: 'text-stone-400',
      navHover: 'hover:text-white hover:scale-105',
      glow: 'from-indigo-950/50 via-blue-950/20 to-transparent',
      vignette: 'radial-gradient(circle at 50% 30%, rgba(20, 25, 45, 0.5) 0%, rgba(11, 12, 16, 1) 90%)',
      cardBg: 'bg-zinc-900/95 border-zinc-800 text-zinc-100 shadow-2xl backdrop-blur-2xl'
    };
  }
}

export default function TempleClient() {
  const { user, profile } = useAuth();

  const [heroUrl, setHeroUrl] = useState<string>('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isTracesOpen, setIsTracesOpen] = useState(false);
  const [isChroniclesOpen, setIsChroniclesOpen] = useState(false);
  const [lighting, setLighting] = useState(getTimeLighting());

  const [posts, setPosts] = useState<TemplePost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [stats, setStats] = useState({
    totalLogs: 0,
    uniqueAuthors: 0,
    vigilsCount: 0,
    letItGoCount: 0,
    sanctuaryHour: new Date().getHours()
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setHeroUrl(Math.random() > 0.5 ? ASSETS.angel : ASSETS.daemon);
    setLighting(getTimeLighting());

    const timer = setInterval(() => {
      setLighting(getTimeLighting());
      setStats(prev => ({ ...prev, sanctuaryHour: new Date().getHours() }));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchLogs() {
      try {
        const res = await fetch('/api/temple_logs', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json || !Array.isArray(json.data)) return;

        const rawData = json.data;
        const formatted: TemplePost[] = rawData
          .filter((item: any) => {
            const type = (item.event_type || '').toLowerCase();
            return type !== 'enter' && type !== 'nav' && type !== 'confess';
          })
          .map((item: any, index: number) => {
            const type = (item.event_type || 'WHISPER').toUpperCase();
            const visuals = getEventVisuals(type);

            let cleanContent = String(item.message ?? '');
            const cleanAuthor = item.author || 'Anonymous';

            if (type === 'ABSOLUTION' && cleanContent.includes('confessed:')) {
              const splitMsg = cleanContent.split('confessed:');
              if (splitMsg.length > 1) cleanContent = `Confessed:${splitMsg.slice(1).join('confessed:')}`;
            }

            return {
              id: item.id ?? `${item.created_at}-${index}`,
              type,
              label: visuals.label,
              author: cleanAuthor,
              time: formatTime(item.created_at),
              content: cleanContent,
              audioUrl: item.audio_url || null,
              icon: visuals.icon,
              color: visuals.color
            };
          });

        setPosts(formatted);

        const authorsSet = new Set(rawData.map((i: any) => i.author).filter(Boolean));
        const vigils = rawData.filter((i: any) => (i.event_type || '').toUpperCase().includes('VIGIL')).length;
        const ashes = rawData.filter((i: any) => (i.event_type || '').toUpperCase() === 'ASH').length;

        setStats({
          totalLogs: rawData.length,
          uniqueAuthors: authorsSet.size,
          vigilsCount: vigils,
          letItGoCount: ashes,
          sanctuaryHour: new Date().getHours()
        });

      } catch (e) {
        console.warn('Failed to fetch temple logs', e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    fetchLogs();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchLogs();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlayingAudio(true);
      }).catch((err) => console.log("Audio error:", err));
    }
  };

  const actionButtonStyle = lighting.bg.includes('1f1a18') || lighting.bg.includes('0b0c10')
    ? 'bg-white/10 border-white/20 text-stone-200 hover:bg-white/20'
    : 'bg-white/80 border-stone-300 text-stone-900 hover:bg-white';

  return (
    <main 
      className={`relative w-full min-h-[100dvh] h-[100dvh] ${lighting.bg} ${lighting.text} font-sans overflow-hidden select-none flex flex-col justify-between p-4 sm:p-8 md:p-12 transition-colors duration-1000`}
      style={{ backgroundImage: lighting.vignette }}
    >
      <audio ref={audioRef} src={ASSETS.ambientAudio} loop preload="auto" />

      {/* Верхняя панель */}
      <header className="relative z-45 flex justify-between items-center w-full max-w-7xl mx-auto pt-2 gap-2">
        <Link 
          href="/heartandangel/world"
          className={`flex items-center gap-2 px-4 sm:px-6 py-2 rounded-full backdrop-blur-md border shadow-sm transition-all text-xs font-serif tracking-wider cursor-pointer ${actionButtonStyle}`}
        >
          <span>← Back to World</span>
        </Link>

        <button
          onClick={toggleAudio}
          className={`flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md transition-all text-xs font-medium tracking-wide shadow-sm cursor-pointer ${actionButtonStyle}`}
        >
          {isPlayingAudio ? <Volume2 size={14} className="text-pink-400 animate-pulse" /> : <Radio size={14} />}
          <span>{isPlayingAudio ? 'Sound On' : 'Sound Off'}</span>
        </button>
      </header>

      {/* ЦЕНТР ЭКРАНА: Главное интерактивное меню и алтарь */}
      <div className="relative w-full flex-1 flex flex-col items-center justify-center text-center px-4 my-auto">
        <div className={`absolute w-[300px] h-[300px] sm:w-[600px] sm:h-[600px] rounded-full bg-gradient-to-tr ${lighting.glow} blur-[90px] pointer-events-none transition-all duration-1000`} />

        {/* Герой слева снизу */}
        <div className="absolute left-[5%] sm:left-[12%] bottom-[10%] z-20 flex flex-col items-center pointer-events-none opacity-85 sm:opacity-100">
          <div className="absolute -bottom-2 w-20 sm:w-28 h-4 sm:h-6 bg-black/25 rounded-full blur-[8px]" />
          {heroUrl && (
            <div className="relative w-24 h-32 sm:w-40 sm:h-48 flex items-end justify-center drop-shadow-[0_15px_25px_rgba(0,0,0,0.3)]">
              <Image src={heroUrl} alt="Temple Guardian" fill className="object-contain" priority draggable={false} />
            </div>
          )}
        </div>

        {/* Кнопки навигации и ритуалов */}
        <div className="relative z-30 flex flex-col items-center gap-6 max-w-xl mx-auto w-full">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <Link 
              href="/heartandangel/calm" 
              className={`px-6 sm:px-8 py-3 sm:py-3.5 rounded-full backdrop-blur-md border shadow-md font-serif text-sm sm:text-base tracking-wider transition-all hover:scale-105 cursor-pointer ${actionButtonStyle}`}
            >
              Calm
            </Link>
            <Link 
              href="/heartandangel/letitgo" 
              className={`px-6 sm:px-8 py-3 sm:py-3.5 rounded-full backdrop-blur-md border shadow-md font-serif text-sm sm:text-base tracking-wider transition-all hover:scale-105 cursor-pointer ${actionButtonStyle}`}
            >
              Let It Go
            </Link>
            <Link 
              href="/vigil" 
              className={`px-6 sm:px-8 py-3 sm:py-3.5 rounded-full backdrop-blur-md border shadow-md font-serif text-sm sm:text-base tracking-wider transition-all hover:scale-105 cursor-pointer ${actionButtonStyle}`}
            >
              Vigil
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 mt-2">
            <button
              onClick={() => setIsChroniclesOpen(true)}
              className={`px-4 sm:px-5 py-2 rounded-full backdrop-blur-md border shadow-sm flex items-center gap-2 transition-transform hover:scale-105 cursor-pointer font-serif text-[11px] sm:text-xs tracking-wider uppercase ${actionButtonStyle}`}
            >
              <Activity size={13} className="opacity-80" />
              <span>Chronicles</span>
            </button>

            <button
              onClick={() => setIsTracesOpen(true)}
              className={`px-4 sm:px-5 py-2 rounded-full backdrop-blur-md border shadow-sm flex items-center gap-2 transition-transform hover:scale-105 cursor-pointer font-serif text-[11px] sm:text-xs tracking-wider uppercase ${actionButtonStyle}`}
            >
              <Layers size={13} className="opacity-80" />
              <span>Traces</span>
            </button>

            <button
              onClick={() => setIsInfoOpen(true)}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border backdrop-blur-sm shadow-sm flex items-center justify-center transition-transform hover:scale-105 cursor-pointer font-serif text-sm italic ${actionButtonStyle}`}
              title="About Temple"
            >
              ?
            </button>
          </div>
        </div>
      </div>

      <div className="h-2 sm:h-4" />

      {/* Модальное окно: Справка (?) */}
      {isInfoOpen && (
        <div 
          onClick={() => setIsInfoOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
        >
          <div 
            onClick={(e: any) => e.stopPropagation()}
            className={`${lighting.cardBg} rounded-3xl p-6 sm:p-8 max-w-md w-full border space-y-4 relative shadow-2xl`}
          >
            <button 
              onClick={() => setIsInfoOpen(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-stone-500/20 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
            <h3 className="font-serif text-2xl font-normal">The Sanctuary</h3>
            <p className="font-serif text-sm leading-relaxed font-light opacity-90">
              This digital temple is a quiet space of presence. Lighting shifts with the real hours of the world. Here, rituals work, and every visitor leaves a trace.
            </p>
          </div>
        </div>
      )}

      {/* Модальное окно: Traces (В одну строку без подложек, яркая иконка и название) */}
      {isTracesOpen && (
        <div 
          onClick={() => setIsTracesOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
        >
          <div 
            onClick={(e: any) => e.stopPropagation()}
            className={`${lighting.cardBg} rounded-3xl p-6 sm:p-8 max-w-2xl w-full border space-y-4 relative shadow-2xl max-h-[80vh] flex flex-col`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-stone-500/20">
              <div>
                <h3 className="font-serif text-xl sm:text-2xl font-normal">Sanctuary Traces</h3>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mt-0.5">Recent actions and offerings</p>
              </div>
              <button 
                onClick={() => setIsTracesOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-500/20 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="divide-y divide-stone-500/10 overflow-y-auto pr-1 flex-1">
              {!loaded ? (
                <p className="font-mono text-xs opacity-60 uppercase tracking-widest animate-pulse py-8 text-center">Reading the ether...</p>
              ) : posts.length === 0 ? (
                <p className="font-mono text-xs opacity-60 uppercase tracking-widest py-8 text-center">No traces recorded yet.</p>
              ) : (
                posts.slice(0, 15).map((post) => {
                  const IconComponent = post.icon || Radio;
                  return (
                    <div key={post.id} className="py-3 flex items-center justify-between gap-3 text-xs sm:text-sm">
                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className={`w-7 h-7 rounded-full bg-stone-500/10 flex items-center justify-center ${post.color || 'text-stone-400'}`}>
                          <IconComponent size={15} />
                        </div>
                        <span className="font-mono text-xs font-bold uppercase tracking-wider">{post.label}</span>
                      </div>

                      <div className="flex-1 font-serif text-xs sm:text-sm font-light opacity-85 truncate px-2 text-center sm:text-left">
                        {post.content}
                      </div>

                      <div className="font-mono text-[10px] opacity-50 shrink-0 text-right">
                        {post.time}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно: Chronicles (Чистая статистика без блоков под цифрами) */}
      {isChroniclesOpen && (
        <div 
          onClick={() => setIsChroniclesOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
        >
          <div 
            onClick={(e: any) => e.stopPropagation()}
            className={`${lighting.cardBg} rounded-3xl p-6 sm:p-8 max-w-md w-full border space-y-6 relative shadow-2xl`}
          >
            <div className="flex items-center justify-between border-b pb-4 border-stone-500/20">
              <div>
                <h3 className="font-serif text-2xl font-normal">Chronicles</h3>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mt-0.5">Sanctuary Analytics</p>
              </div>
              <button 
                onClick={() => setIsChroniclesOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-500/20 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 py-2">
              <div className="flex flex-col items-center justify-center text-center space-y-1">
                <Users size={20} className="opacity-60 mb-1" />
                <span className="font-mono text-3xl sm:text-4xl font-light tracking-tight">{stats.uniqueAuthors}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">Unique Seekers</span>
              </div>

              <div className="flex flex-col items-center justify-center text-center space-y-1">
                <Activity size={20} className="opacity-60 mb-1" />
                <span className="font-mono text-3xl sm:text-4xl font-light tracking-tight">{stats.totalLogs}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">Total Offerings</span>
              </div>

              <div className="flex flex-col items-center justify-center text-center space-y-1">
                <Flame size={20} className="text-amber-500 mb-1" />
                <span className="font-mono text-3xl sm:text-4xl font-light tracking-tight">{stats.vigilsCount}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">Vigil Sparks</span>
              </div>

              <div className="flex flex-col items-center justify-center text-center space-y-1">
                <Clock size={20} className="text-indigo-400 mb-1" />
                <span className="font-mono text-3xl sm:text-4xl font-light tracking-tight">{stats.sanctuaryHour}:00</span>
                <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">Sanctuary Hour</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
