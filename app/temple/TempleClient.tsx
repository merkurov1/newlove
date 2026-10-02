'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import Header from '@/components/Header';
import { useAuth } from '@/components/AuthContext';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Send,
  Mic,
  Square,
  Trash2,
  Flame,
  Radio,
  ExternalLink,
  Volume2,
  Compass,
  ShieldCheck,
  Moon,
  Sun,
  X
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
    case 'AUDIO_WHISPER':
      return { icon: Mic, color: 'text-amber-300', label: 'Voice' };
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

// Освещение комнаты по времени суток
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
      cardBg: 'bg-white/80 border-stone-200 text-stone-900 shadow-xl'
    };
  } else if (hour >= 11 && hour < 17) {
    return {
      bg: 'bg-[#FAF8F5]',
      text: 'text-stone-900',
      subText: 'text-stone-600',
      navHover: 'hover:text-black hover:scale-105',
      glow: 'from-stone-200/40 via-transparent to-transparent',
      vignette: 'radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.8) 0%, rgba(250, 248, 245, 1) 85%)',
      cardBg: 'bg-white/90 border-stone-200 text-stone-900 shadow-xl'
    };
  } else if (hour >= 17 && hour < 21) {
    return {
      bg: 'bg-[#1f1a18]',
      text: 'text-stone-100',
      subText: 'text-stone-300',
      navHover: 'hover:text-white hover:scale-105',
      glow: 'from-orange-900/30 via-rose-950/20 to-transparent',
      vignette: 'radial-gradient(circle at 50% 40%, rgba(70, 35, 25, 0.4) 0%, rgba(31, 26, 24, 1) 90%)',
      cardBg: 'bg-stone-900/90 border-stone-800 text-stone-100 shadow-2xl'
    };
  } else {
    return {
      bg: 'bg-[#0b0c10]',
      text: 'text-stone-200',
      subText: 'text-stone-400',
      navHover: 'hover:text-white hover:scale-105',
      glow: 'from-indigo-950/50 via-blue-950/20 to-transparent',
      vignette: 'radial-gradient(circle at 50% 30%, rgba(20, 25, 45, 0.5) 0%, rgba(11, 12, 16, 1) 90%)',
      cardBg: 'bg-zinc-900/90 border-zinc-800 text-zinc-100 shadow-2xl'
    };
  }
}

export default function TempleClient() {
  const { user, profile } = useAuth();
  const isLoggedIn = !!user;

  const [heroUrl, setHeroUrl] = useState<string>('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isEventsOpen, setIsEventsOpen] = useState(false);
  const [lighting, setLighting] = useState(getTimeLighting());

  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState<TemplePost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const baseTextRef = useRef('');

  const userName = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Visitor';

  useEffect(() => {
    setHeroUrl(Math.random() > 0.5 ? ASSETS.angel : ASSETS.daemon);
    setLighting(getTimeLighting());

    const timer = setInterval(() => {
      setLighting(getTimeLighting());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
    };
  }, [audioBlobUrl]);

  useEffect(() => {
    return () => {
      const mr = mediaRecorderRef.current;
      if (mr) {
        mr.onstop = null;
        if (mr.state !== 'inactive') mr.stop();
      }
      streamRef.current?.getTracks().forEach(t => t.stop());
      try { recognitionRef.current?.stop(); } catch {}
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchLogs() {
      try {
        const res = await fetch('/api/temple_logs', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json || !Array.isArray(json.data)) return;

        const formatted: TemplePost[] = json.data
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

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    setIsRecording(false);
  }, []);

  return (
    <main 
      className={`relative w-full h-[100dvh] ${lighting.bg} ${lighting.text} font-sans overflow-hidden select-none flex flex-col justify-between p-6 sm:p-12 transition-colors duration-1000`}
      style={{ backgroundImage: lighting.vignette }}
    >
      {/* Скрытый аудиоэлемент */}
      <audio ref={audioRef} src={ASSETS.ambientAudio} loop preload="auto" />

      {/* Верхняя минималистичная панель */}
      <header className="relative z-45 flex justify-between items-center w-full max-w-7xl mx-auto pt-2">
        <Link 
          href="/heartandangel/world"
          className={`font-serif text-sm tracking-widest ${lighting.subText} hover:opacity-100 opacity-70 transition-opacity`}
        >
          ← Back to World
        </Link>

        <button
          onClick={toggleAudio}
          className={`flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md transition-all text-xs font-medium tracking-wide shadow-sm cursor-pointer ${
            lighting.bg.includes('1f1a18') || lighting.bg.includes('0b0c10') 
              ? 'bg-white/10 hover:bg-white/20 text-stone-200' 
              : 'bg-stone-200/60 hover:bg-stone-200 text-stone-800'
          }`}
        >
          {isPlayingAudio ? <Volume2 size={14} className="text-pink-400 animate-pulse" /> : <Radio size={14} />}
          <span>{isPlayingAudio ? 'Sound On' : 'Sound Off'}</span>
        </button>
      </header>

      {/* ЦЕНТР ЭКРАНА: Главное интерактивное меню и алтарь */}
      <div className="relative w-full flex-1 flex flex-col items-center justify-center text-center">
        {/* Атмосферный свет комнаты */}
        <div className={`absolute w-[450px] h-[450px] sm:w-[650px] sm:h-[650px] rounded-full bg-gradient-to-tr ${lighting.glow} blur-[90px] pointer-events-none transition-all duration-1000`} />

        {/* Герой слева снизу */}
        <div className="absolute left-[15%] bottom-[15%] z-20 flex flex-col items-center pointer-events-none">
          <div className="absolute -bottom-2 w-28 h-6 bg-black/25 rounded-full blur-[8px]" />
          {heroUrl && (
            <div className="relative w-32 h-40 sm:w-44 sm:h-52 flex items-end justify-center drop-shadow-[0_20px_35px_rgba(0,0,0,0.3)]">
              <Image src={heroUrl} alt="Temple Guardian" fill className="object-contain" priority draggable={false} />
            </div>
          )}
        </div>

        {/* Крупные пункты меню и кнопки в самом центре экрана */}
        <div className="relative z-30 flex flex-col items-center gap-6 max-w-xl mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            <Link 
              href="/heartandangel/calm" 
              className={`font-serif text-2xl sm:text-4xl font-light tracking-wide transition-transform ${lighting.navHover}`}
            >
              Calm
            </Link>
            <Link 
              href="/heartandangel/letitgo" 
              className={`font-serif text-2xl sm:text-4xl font-light tracking-wide transition-transform ${lighting.navHover}`}
            >
              Let It Go
            </Link>
            <Link 
              href="https://merkurov.love/vigil" 
              target="_blank" 
              rel="noopener noreferrer" 
              className={`font-serif text-2xl sm:text-4xl font-light tracking-wide transition-transform ${lighting.navHover}`}
            >
              Vigil
            </Link>
          </div>

          {/* Крупные интерактивные кнопки: Статистика/Хроники (✦) и Справка (?) */}
          <div className="flex items-center gap-4 mt-2">
            <button
              onClick={() => setIsEventsOpen(true)}
              className={`px-6 py-3 rounded-full backdrop-blur-md border shadow-lg flex items-center gap-3 transition-transform hover:scale-105 cursor-pointer font-serif text-base ${
                lighting.bg.includes('1f1a18') || lighting.bg.includes('0b0c10')
                  ? 'bg-white/10 border-white/20 text-stone-100 hover:bg-white/20'
                  : 'bg-white/90 border-stone-300 text-stone-900 hover:bg-white'
              }`}
            >
              <span className="text-lg">✦</span>
              <span>Chronicles &amp; Traces ({posts.length})</span>
            </button>

            <button
              onClick={() => setIsInfoOpen(true)}
              className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 cursor-pointer font-serif text-xl italic ${
                lighting.bg.includes('1f1a18') || lighting.bg.includes('0b0c10')
                  ? 'bg-stone-100 text-stone-900 hover:bg-white'
                  : 'bg-stone-900 text-white hover:bg-stone-800'
              }`}
              title="About Temple"
            >
              ?
            </button>
          </div>
        </div>
      </div>

      {/* Низ экрана (пусто для воздуха) */}
      <div className="h-4" />

      {/* Флоатинг с текстом (?) */}
      {isInfoOpen && (
        <div 
          onClick={() => setIsInfoOpen(false)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div 
            onClick={(e: any) => e.stopPropagation()}
            className={`${lighting.cardBg} rounded-3xl p-8 max-w-md w-full border space-y-4 relative`}
          >
            <button 
              onClick={() => setIsInfoOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-500/20 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
            <h3 className="font-serif text-2xl">The Sanctuary</h3>
            <p className="font-serif text-sm leading-relaxed font-light opacity-90">
              This digital temple is a quiet space of presence. Lighting shifts with the real hours of the world. Here, rituals work, and every visitor leaves a trace.
            </p>
          </div>
        </div>
      )}

      {/* Флоатинг с событиями и статистикой (✦) */}
      {isEventsOpen && (
        <div 
          onClick={() => setIsEventsOpen(false)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div 
            onClick={(e: any) => e.stopPropagation()}
            className={`${lighting.cardBg} rounded-3xl p-8 max-w-md w-full border space-y-6 relative`}
          >
            <button 
              onClick={() => setIsEventsOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-500/20 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-2xl">Chronicles &amp; Traces</h3>
              <span className="font-mono text-xs opacity-75">{posts.length} entries recorded</span>
            </div>
            
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {!loaded ? (
                <p className="font-mono text-xs opacity-60 uppercase tracking-widest animate-pulse">Loading temple history...</p>
              ) : posts.length === 0 ? (
                <p className="font-mono text-xs opacity-60 uppercase tracking-widest">No traces recorded yet.</p>
              ) : (
                posts.slice(0, 10).map((post) => (
                  <div key={post.id} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider opacity-75">{post.author}</span>
                      <span className="font-mono text-[10px] opacity-60">{post.time}</span>
                    </div>
                    <p className="font-serif text-sm font-light line-clamp-2 opacity-90">{post.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
