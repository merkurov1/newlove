'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Moon
} from 'lucide-react';
import Link from 'next/link';

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
  badgeBg?: string;
}

const RITUALS = [
  { href: '/cast', label: 'Cast', desc: 'Psyche & archetype', glow: 'hover:border-indigo-300 hover:shadow-[0_0_25px_rgba(99,102,241,0.15)]', accent: 'text-indigo-600' },
  { href: '/vigil', label: 'Vigil', desc: 'Spark & watch', glow: 'hover:border-amber-300 hover:shadow-[0_0_25px_rgba(245,158,11,0.15)]', accent: 'text-amber-600' },
  { href: '/absolution', label: 'Absolution', desc: 'Confess & release', glow: 'hover:border-emerald-300 hover:shadow-[0_0_25px_rgba(16,185,129,0.15)]', accent: 'text-emerald-600' },
  { href: '/heartandangel/calm', label: 'Calm', desc: 'Center attention', glow: 'hover:border-purple-300 hover:shadow-[0_0_25px_rgba(168,85,247,0.15)]', accent: 'text-purple-600' },
  { href: '/heartandangel/letitgo', label: 'Let It Go', desc: 'Drop the burden', glow: 'hover:border-rose-300 hover:shadow-[0_0_25px_rgba(244,63,94,0.15)]', accent: 'text-rose-600' }
];

function getEventVisuals(eventType: string) {
  switch (eventType?.toUpperCase()) {
    case 'VIGIL':
    case 'VIGIL_SPARK':
      return { icon: Flame, color: 'text-amber-600', label: 'Vigil', badgeBg: 'bg-amber-50/90 border-amber-200/80 text-amber-900 shadow-sm' };
    case 'ASH':
      return { icon: Trash2, color: 'text-rose-600', label: 'Let It Go', badgeBg: 'bg-rose-50/90 border-rose-200/80 text-rose-900 shadow-sm' };
    case 'CAST':
      return { icon: Compass, color: 'text-indigo-600', label: 'Cast', badgeBg: 'bg-indigo-50/90 border-indigo-200/80 text-indigo-900 shadow-sm' };
    case 'ABSOLUTION':
      return { icon: ShieldCheck, color: 'text-emerald-600', label: 'Absolution', badgeBg: 'bg-emerald-50/90 border-emerald-200/80 text-emerald-900 shadow-sm' };
    case 'HEARTANDANGEL':
    case 'MEDITATION':
    case 'SILENCE':
      return { icon: Moon, color: 'text-purple-600', label: 'Calm', badgeBg: 'bg-purple-50/90 border-purple-200/80 text-purple-900 shadow-sm' };
    case 'WHISPER':
      return { icon: Sparkles, color: 'text-zinc-900', label: 'Whisper', badgeBg: 'bg-white/90 border-zinc-200/80 text-zinc-800 shadow-sm' };
    case 'AUDIO_WHISPER':
      return { icon: Mic, color: 'text-zinc-900', label: 'Voice', badgeBg: 'bg-white/90 border-zinc-200/80 text-zinc-800 shadow-sm' };
    default:
      return { icon: Radio, color: 'text-zinc-600', label: eventType || 'Log', badgeBg: 'bg-white/90 border-zinc-200/80 text-zinc-800 shadow-sm' };
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
  const { user, profile, isLoading } = useAuth();
  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState<TemplePost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const baseTextRef = useRef('');

  const userName = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Visitor';

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
              color: visuals.color,
              badgeBg: visuals.badgeBg
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

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    setIsRecording(false);
  }, []);

  const toggleRecording = async () => {
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
    if ((!postText.trim() && !audioBlobUrl) || isSubmitting) return;
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
        color: visuals.color,
        badgeBg: visuals.badgeBg
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

  const renderContentWithLinks = (text: string) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return parts.map((part, index) => {
      if (index % 2 === 1) {
        try {
          const hostname = new URL(part).hostname.replace('www.', '');
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-zinc-100 border border-zinc-200 text-zinc-900 text-xs font-mono hover:bg-zinc-200 transition-colors my-1 break-all"
            >
              <ExternalLink size={12} className="shrink-0 text-zinc-500" />
              <span>{hostname}</span>
            </a>
          );
        } catch {
          return (
            <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-zinc-900 underline underline-offset-4 break-all">
              {part}
            </a>
          );
        }
      }
      return part;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F6F4F0] via-[#F0ECE6] to-[#E8E3DA] text-zinc-900 font-sans selection:bg-zinc-900 selection:text-white relative overflow-x-hidden antialiased">
      
      {/* Atmospheric ambient background glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-gradient-to-tr from-amber-300/15 via-indigo-300/10 to-purple-300/15 blur-[160px] pointer-events-none rounded-full" />

      <Header />

      <main className="max-w-3xl mx-auto px-6 pt-36 pb-28 relative z-10 space-y-12">
        
        {/* SANCTUARY HERO & RITUAL PORTALS */}
        <section className="text-center space-y-8 pt-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.02)] font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-700 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span>Sanctuary Active</span>
          </div>

          <div className="space-y-4 max-w-2xl mx-auto">
            <h1 className="font-serif text-3xl sm:text-5xl font-normal text-zinc-900 tracking-tight leading-[1.15]">
              A real place on the internet where rituals work and every visitor leaves a trace.
            </h1>
            <p className="font-serif text-base sm:text-lg text-zinc-600/90 max-w-lg mx-auto leading-relaxed">
              The temple has its own memory, woven from your actions and whispers.
            </p>
          </div>

          {/* Ritual Portals Grid */}
          <nav aria-label="Rituals" className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
            {RITUALS.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className={`group p-3.5 rounded-2xl bg-white/80 backdrop-blur-xl border border-zinc-200/90 text-left transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:-translate-y-0.5 hover:bg-white ${r.glow}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`font-mono text-xs uppercase tracking-[0.15em] font-bold ${r.accent}`}>
                    {r.label}
                  </span>
                  <ExternalLink size={12} className="text-zinc-300 group-hover:text-zinc-700 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
                <p className="font-serif text-xs text-zinc-500 group-hover:text-zinc-800 leading-tight">
                  {r.desc}
                </p>
              </Link>
            ))}
          </nav>
        </section>

        {/* THE ALTAR / INPUT BOX (Always accessible, elegant & clean) */}
        <section className="relative">
          <div className="p-6 sm:p-7 rounded-3xl bg-white/90 backdrop-blur-2xl border border-zinc-200/95 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-4 transition-all hover:border-zinc-300/80">
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder={user ? "Broadcast a whisper, drop a link, or record a voice note..." : "Sign in via header to broadcast a whisper..."}
              rows={3}
              className="w-full bg-transparent text-base sm:text-lg text-zinc-900 placeholder-zinc-400 resize-none focus:outline-none font-serif leading-relaxed"
            />

            {audioBlobUrl && (
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-100/90 border border-zinc-200 shadow-inner">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center shadow-sm">
                    <Volume2 size={14} />
                  </div>
                  <span className="font-mono text-xs uppercase tracking-wider text-zinc-700">Voice Note Ready</span>
                </div>
                <audio controls src={audioBlobUrl} className="h-8 max-w-[200px]" />
              </div>
            )}

            {error && (
              <p role="alert" className="font-mono text-[11px] uppercase tracking-wider text-rose-600">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-zinc-200/60">
              <button
                type="button"
                onClick={toggleRecording}
                className={`px-4 py-2.5 rounded-full transition-all border flex items-center gap-2 text-xs font-mono uppercase tracking-wider ${
                  isRecording
                    ? 'bg-rose-500 text-white border-rose-500 animate-pulse shadow-md'
                    : 'bg-white text-zinc-700 border-zinc-200/90 hover:bg-zinc-50 shadow-sm'
                }`}
              >
                {isRecording ? <Square size={13} /> : <Mic size={13} />}
                <span>{isRecording ? 'Stop' : 'Voice Note'}</span>
              </button>

              <button
                type="button"
                onClick={handleSendPost}
                disabled={isSubmitting || (!postText.trim() && !audioBlobUrl)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-zinc-900 text-white font-medium text-xs shadow-sm hover:bg-zinc-800 active:scale-95 transition-all disabled:opacity-40 font-mono uppercase tracking-wider"
              >
                <span>{isSubmitting ? 'Transmitting...' : 'Broadcast'}</span>
                <Send size={13} />
              </button>
            </div>
          </div>
        </section>

        {/* THE LIVING STREAM */}
        <section className="space-y-4 pt-2">
          {!loaded ? (
            <div className="p-12 text-center rounded-3xl bg-white/40 border border-zinc-200/60 text-zinc-400 font-mono text-xs uppercase tracking-wider animate-pulse">
              Listening to the temple...
            </div>
          ) : posts.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-white/40 border border-zinc-200/60 text-zinc-500 font-mono text-xs uppercase tracking-wider">
              The logbook is empty. Leave the first trace.
            </div>
          ) : (
            posts.map((post) => {
              const PostIcon = post.icon || Sparkles;

              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={post.id}
                  className="p-6 rounded-3xl bg-white/90 backdrop-blur-xl border border-zinc-200/90 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_15px_40px_rgba(0,0,0,0.04)] transition-all duration-300 space-y-3"
                >
                  {/* Single-line metadata header */}
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${post.badgeBg || 'bg-white border-zinc-200 text-zinc-800'}`}>
                        <PostIcon size={12} className={post.color} />
                        <span>{post.label}</span>
                      </span>
                      <span className="text-zinc-300">•</span>
                      <span className="text-zinc-800 font-semibold">{post.author}</span>
                    </div>
                    <span className="text-zinc-400 text-[11px]">{post.time}</span>
                  </div>

                  {/* Content body */}
                  <div className="text-base sm:text-lg text-zinc-900 leading-relaxed font-serif break-words pl-1">
                    {renderContentWithLinks(post.content)}
                  </div>

                  {post.audioUrl && (
                    <div className="pt-2 pl-1">
                      <audio controls src={post.audioUrl} className="w-full h-9 rounded-xl" />
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </section>

      </main>
    </div>
  );
}
