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
  Fingerprint,
  Lock,
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
      return { icon: Flame, color: 'text-amber-600', label: 'Vigil' };
    case 'ASH':
      return { icon: Trash2, color: 'text-rose-600', label: 'Let It Go' };
    case 'CAST':
      return { icon: Compass, color: 'text-indigo-600', label: 'Cast' };
    case 'ABSOLUTION':
      return { icon: ShieldCheck, color: 'text-emerald-600', label: 'Absolution' };
    case 'HEARTANDANGEL':
    case 'MEDITATION':
    case 'SILENCE':
      return { icon: Moon, color: 'text-purple-600', label: 'Calm' };
    case 'WHISPER':
      return { icon: Sparkles, color: 'text-zinc-900', label: 'Whisper' };
    case 'AUDIO_WHISPER':
      return { icon: Mic, color: 'text-zinc-900', label: 'Voice' };
    default:
      return { icon: Radio, color: 'text-zinc-600', label: eventType || 'Log' };
  }
}

function formatTime(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

export default function TempleClient() {
  const { user, profile } = useAuth();
  const isLoggedIn = !!user;

  const [heroUrl, setHeroUrl] = useState<string>('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isEventsOpen, setIsEventsOpen] = useState(false);

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

  const toggleRecording = async () => {
    if (!isLoggedIn) return;
    if (isRecording) {
      stopRecording();
      return;
    }

    setError(null);
    audioChunksRef.current = [];
    baseTextRef.current = postText;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        setAudioBlobUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);

      const WinSpeech = window as unknown as {
        SpeechRecognition?: new () => any;
        webkitSpeechRecognition?: new () => any;
      };
      const SpeechRecognition = WinSpeech.SpeechRecognition || WinSpeech.webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = navigator.language || 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let transcript = '';
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          const base = baseTextRef.current;
          setPostText((base ? base + ' ' : '') + transcript);
        };
        recognition.onerror = () => {};
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (e) {
      console.error('Microphone access error:', e);
      setError('Could not access microphone.');
      setIsRecording(false);
    }
  };

  const handleSendPost = async () => {
    if (!isLoggedIn || ((!postText.trim() && !audioBlobUrl) || isSubmitting)) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        event_type: audioBlobUrl ? 'AUDIO_WHISPER' : 'WHISPER',
        message: postText || 'Voice transmission',
        audio_url: audioBlobUrl || null,
        author: userName
      };

      const res = await fetch('/api/temple_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        setError('The temple did not accept the transmission. Try again.');
        return;
      }

      const json = await res.json().catch(() => ({}));
      const visuals = getEventVisuals(payload.event_type);
      const newItem: TemplePost = {
        id: json?.data?.id ?? `local-${Date.now()}`,
        type: payload.event_type,
        label: visuals.label,
        author: userName,
        time: formatTime(),
        content: payload.message,
        audioUrl: audioBlobUrl,
        icon: visuals.icon,
        color: visuals.color
      };
      setPosts(prev => [newItem, ...prev]);
      setPostText('');
      setAudioBlobUrl(null);
    } catch (e) {
      console.error('Failed to transmit post', e);
      setError('Connection lost. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative w-full h-[100dvh] bg-[#FAF8F5] text-[#111] font-sans overflow-hidden select-none flex flex-col justify-between p-6 sm:p-12">
      {/* Скрытый аудиоэлемент */}
      <audio ref={audioRef} src={ASSETS.ambientAudio} loop preload="auto" />

      {/* Верхняя панель: Назад в мир слева, Меню и Звук справа сверху */}
      <header className="relative z-45 flex justify-between items-center w-full max-w-7xl mx-auto pt-2">
        <Link 
          href="/heartandangel/world"
          className="font-serif text-sm tracking-widest text-stone-600 hover:text-black transition-colors"
        >
          ← Back to World
        </Link>

        <nav className="flex items-center gap-6 sm:gap-10">
          <button
            onClick={toggleAudio}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-stone-200/60 hover:bg-stone-200 transition-all text-stone-800 text-xs font-medium tracking-wide shadow-sm cursor-pointer"
          >
            {isPlayingAudio ? <Volume2 size={14} className="text-pink-500 animate-pulse" /> : <Radio size={14} />}
            <span>{isPlayingAudio ? 'Sound On' : 'Sound Off'}</span>
          </button>

          <Link href="/heartandangel/calm" className="font-serif text-lg sm:text-xl font-light hover:italic transition-all">
            Calm
          </Link>
          <Link href="/heartandangel/letitgo" className="font-serif text-lg sm:text-xl font-light hover:italic transition-all">
            Let It Go
          </Link>
          <Link href="https://merkurov.love/vigil" target="_blank" rel="noopener noreferrer" className="font-serif text-lg sm:text-xl font-light hover:italic transition-all">
            Vigil
          </Link>
        </nav>
      </header>

      {/* Центр комнаты / Основное пространство */}
      <div className="relative w-full flex-1 flex items-center justify-center">
        {/* Герой слева снизу (отступ 20% от краев) */}
        <div className="absolute left-[20%] bottom-[20%] z-20 flex flex-col items-center pointer-events-none">
          <div className="absolute -bottom-2 w-28 h-6 bg-black/15 rounded-full blur-[6px]" />
          {heroUrl && (
            <div className="relative w-36 h-44 sm:w-48 sm:h-56 flex items-end justify-center drop-shadow-[0_15px_25px_rgba(0,0,0,0.2)]">
              <Image src={heroUrl} alt="Temple Guardian" fill className="object-contain" priority draggable={false} />
            </div>
          )}
        </div>
      </div>

      {/* Плавающие кнопки управления (Справа снизу) */}
      <div className="absolute bottom-8 right-8 z-45 flex items-center gap-3">
        {/* Кнопка событий */}
        <button 
          onClick={() => setIsEventsOpen(!isEventsOpen)}
          className="w-12 h-12 rounded-full bg-white border border-stone-200 shadow-lg flex items-center justify-center text-stone-800 hover:bg-stone-50 transition-all font-mono text-sm cursor-pointer"
          title="Temple Events"
        >
          ✦
        </button>

        {/* Кнопка с вопросом для флоатинга с текстом */}
        <button 
          onClick={() => setIsInfoOpen(!isInfoOpen)}
          className="w-12 h-12 rounded-full bg-stone-900 text-white shadow-lg flex items-center justify-center hover:bg-stone-800 transition-all font-serif text-lg italic cursor-pointer"
          title="About Temple"
        >
          ?
        </button>
      </div>

      {/* Флоатинг с текстом (?) */}
      {isInfoOpen && (
        <div 
          onClick={() => setIsInfoOpen(false)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div 
            onClick={(e: any) => e.stopPropagation()}
            className="bg-white rounded-3xl p-8 max-w-md shadow-2xl border border-stone-200 space-y-4 relative"
          >
            <button 
              onClick={() => setIsInfoOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:text-black transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
            <h3 className="font-serif text-2xl text-stone-900">The Sanctuary</h3>
            <p className="font-serif text-stone-600 text-sm leading-relaxed font-light">
              This digital temple is a quiet space of presence. Here, the boundaries between the physical artifacts and the digital ether dissolve into pure observation, rituals work, and every visitor leaves a trace.
            </p>
          </div>
        </div>
      )}

      {/* Флоатинг с событиями (Компактный список БЕЗ разделителей) */}
      {isEventsOpen && (
        <div 
          onClick={() => setIsEventsOpen(false)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div 
            onClick={(e: any) => e.stopPropagation()}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-stone-200 space-y-6 relative"
          >
            <button 
              onClick={() => setIsEventsOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:text-black transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
            <h3 className="font-serif text-2xl text-stone-900">Chronicles &amp; Traces</h3>
            
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {!loaded ? (
                <p className="font-mono text-xs text-stone-400 uppercase tracking-widest animate-pulse">Loading temple history...</p>
              ) : posts.length === 0 ? (
                <p className="font-mono text-xs text-stone-400 uppercase tracking-widest">No traces recorded yet.</p>
              ) : (
                posts.slice(0, 10).map((post) => (
                  <div key={post.id} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-stone-400 uppercase tracking-wider">{post.author}</span>
                      <span className="font-mono text-[10px] text-stone-400">{post.time}</span>
                    </div>
                    <p className="font-serif text-sm text-stone-800 font-light line-clamp-2">{post.content}</p>
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
