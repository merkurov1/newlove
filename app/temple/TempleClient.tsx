'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import SoundToggle from '@/components/SoundToggle';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Flame,
  Radio,
  Compass,
  ShieldCheck,
  Moon,
  Trash2,
  X,
  Users,
  Activity,
  Clock,
  Layers
} from 'lucide-react';
import Link from 'next/link';

const ASSETS = {
  angel: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png',
  daemon: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Daemon1.png',
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

const DEFAULT_LIGHTING = {
  bg: 'bg-[#FAF8F5]',
  text: 'text-stone-900',
  subText: 'text-stone-600',
  glow: 'from-stone-200/40 via-transparent to-transparent',
  vignette: 'radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.8) 0%, rgba(250, 248, 245, 1) 85%)',
  cardBg: 'bg-white/95 border-stone-200 text-stone-900 shadow-2xl backdrop-blur-2xl'
};

function getTimeLighting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) {
    return {
      bg: 'bg-[#F5F2EB]',
      text: 'text-stone-900',
      subText: 'text-stone-600',
      glow: 'from-amber-200/30 via-orange-100/10 to-transparent',
      vignette: 'radial-gradient(circle at 50% 30%, rgba(255, 243, 224, 0.6) 0%, rgba(245, 242, 235, 1) 80%)',
      cardBg: 'bg-white/95 border-stone-200 text-stone-900 shadow-2xl backdrop-blur-2xl'
    };
  } else if (hour >= 11 && hour < 17) {
    return DEFAULT_LIGHTING;
  } else if (hour >= 17 && hour < 21) {
    return {
      bg: 'bg-[#1f1a18]',
      text: 'text-stone-100',
      subText: 'text-stone-300',
      glow: 'from-orange-900/30 via-rose-950/20 to-transparent',
      vignette: 'radial-gradient(circle at 50% 40%, rgba(70, 35, 25, 0.4) 0%, rgba(31, 26, 24, 1) 90%)',
      cardBg: 'bg-stone-900/95 border-stone-800 text-stone-100 shadow-2xl backdrop-blur-2xl'
    };
  } else {
    return {
      bg: 'bg-[#0b0c10]',
      text: 'text-stone-200',
      subText: 'text-stone-400',
      glow: 'from-indigo-950/50 via-blue-950/20 to-transparent',
      vignette: 'radial-gradient(circle at 50% 30%, rgba(20, 25, 45, 0.5) 0%, rgba(11, 12, 16, 1) 90%)',
      cardBg: 'bg-zinc-900/95 border-zinc-800 text-zinc-100 shadow-2xl backdrop-blur-2xl'
    };
  }
}

export default function TempleClient() {
  const [heroUrl, setHeroUrl] = useState<string>('');
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isTracesOpen, setIsTracesOpen] = useState(false);
  const [isChroniclesOpen, setIsChroniclesOpen] = useState(false);
  const [lighting, setLighting] = useState(DEFAULT_LIGHTING);

  const [posts, setPosts] = useState<TemplePost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [stats, setStats] = useState({
    totalLogs: 0,
    uniqueAuthors: 0,
    vigilsCount: 0,
    letItGoCount: 0,
    sanctuaryHour: 12
  });

  useEffect(() => {
    setHeroUrl(Math.random() > 0.5 ? ASSETS.angel : ASSETS.daemon);
    setLighting(getTimeLighting());
    setStats(prev => ({ ...prev, sanctuaryHour: new Date().getHours() }));

    const timer = setInterval(() => {
      setLighting(getTimeLighting());
      setStats(prev => ({ ...prev, sanctuaryHour: new Date().getHours() }));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchLogs() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

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
      fetchLogs();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const actionButtonStyle = lighting.bg.includes('1f1a18') || lighting.bg.includes('0b0c10')
    ? 'bg-white/10 border-white/20 text-stone-200 hover:bg-white/20'
    : 'bg-white/80 border-stone-300 text-stone-900 hover:bg-white';

  return (
    <div 
      className={`relative w-full min-h-[100dvh] ${lighting.bg} ${lighting.text} font-sans overflow-y-auto select-none flex flex-col justify-between p-4 sm:p-8 md:p-12 transition-colors duration-1000`}
      style={{ backgroundImage: lighting.vignette }}
    >
      <header className="relative z-40 flex items-center justify-between w-full max-w-7xl mx-auto pt-24 sm:pt-28 md:pt-36 px-3 sm:px-6">
        <Link 
          href="/heartandangel/world"
          className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-full backdrop-blur-md border shadow-md transition-all text-xs font-serif tracking-wider cursor-pointer ${actionButtonStyle}`}
        >
          <span>← Back to World</span>
        </Link>

        <SoundToggle className={`px-4 sm:px-4 py-2.5 border shadow-md ${actionButtonStyle}`} />
      </header>

      <div className="relative w-full flex-1 flex flex-col items-center justify-center text-center px-4 my-auto py-10">
        <div className={`absolute w-[300px] h-[300px] sm:w-[600px] sm:h-[600px] rounded-full bg-gradient-to-tr ${lighting.glow} blur-[90px] pointer-events-none transition-all duration-1000`} />

        <div className="absolute left-[5%] sm:left-[12%] bottom-[10%] z-20 flex flex-col items-center pointer-events-none opacity-85 sm:opacity-100">
          <div className="absolute -bottom-2 w-20 sm:w-28 h-4 sm:h-6 bg-black/25 rounded-full blur-[8px]" />
          {heroUrl && (
            <div className="relative w-24 h-32 sm:w-40 sm:h-48 flex items-end justify-center drop-shadow-[0_15px_25px_rgba(0,0,0,0.3)]">
              <Image src={heroUrl} alt="Temple Guardian" fill className="object-contain" priority draggable={false} />
            </div>
          )}
        </div>

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

      <AnimatePresence>
        {isInfoOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsInfoOpen(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTracesOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsTracesOpen(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
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

                        <div className="flex-1 font-serif text-xs sm:text-sm font-light opacity-85 truncate px-2 flex items-center gap-2 text-left">
                          <span className="font-medium opacity-75 shrink-0 text-xs">{post.author}</span>
                          <span className="opacity-40">•</span>
                          <span className="truncate">{post.content}</span>
                        </div>

                        <div className="font-mono text-[10px] opacity-50 shrink-0 text-right">
                          {post.time}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isChroniclesOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsChroniclesOpen(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
