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
  Moon,
  Fingerprint,
  Lock
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
}

const RITUALS = [
  { href: '/cast', label: 'Cast', desc: 'Psyche & archetype navigation', icon: Compass, accent: 'text-indigo-600', bg: 'hover:bg-indigo-50/40', border: 'hover:border-indigo-300' },
  { href: '/vigil', label: 'Vigil', desc: 'Spark & watch the flame', icon: Flame, accent: 'text-amber-600', bg: 'hover:bg-amber-50/40', border: 'hover:border-amber-300' },
  { href: '/absolution', label: 'Absolution', desc: 'Confess & release burdens', icon: ShieldCheck, accent: 'text-emerald-600', bg: 'hover:bg-emerald-50/40', border: 'hover:border-emerald-300' },
  { href: '/heartandangel/calm', label: 'Calm', desc: 'Center attention in silence', icon: Moon, accent: 'text-purple-600', bg: 'hover:bg-purple-50/40', border: 'hover:border-purple-300' },
  { href: '/heartandangel/letitgo', label: 'Let It Go', desc: 'Drop the heavy weight', icon: Trash2, accent: 'text-rose-600', bg: 'hover:bg-rose-50/40', border: 'hover:border-rose-300' }
];

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
  
  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState<TemplePost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [traceCount, setTraceCount] = useState<number>(1420);

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

        setTraceCount(1240 + json.data.length * 3);

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
      setTraceCount(c => c + 1);
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
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-900 text-xs font-mono hover:bg-zinc-200 transition-colors mx-1"
            >
              <ExternalLink size={11} className="shrink-0 text-zinc-500" />
              <span>{hostname}</span>
            </a>
          );
        } catch {
          return (
            <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-zinc-900 underline underline-offset-2">
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
      
      {/* Solemn sanctuary ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1400px] h-[650px] bg-gradient-to-tr from-amber-300/10 via-indigo-300/5 to-purple-300/10 blur-[180px] pointer-events-none rounded-full" />

      <Header />

      <main className="max-w-7xl mx-auto px-6 pt-36 lg:pt-40 pb-32 relative z-10 space-y-10">
        
        {/* TOP LEVEL: COMPACT CENTRAL ALTAR (RESTRICTED TO LOGGED-IN USERS) */}
        <section className="max-w-xl mx-auto">
          <div className={`p-4 sm:p-5 rounded-3xl bg-white/90 backdrop-blur-2xl border transition-all shadow-[0_15px_40px_rgba(0,0,0,0.03)] space-y-3 ${
            isLoggedIn ? 'border-zinc-200/95 hover:border-zinc-300' : 'border-zinc-200/60 opacity-90'
          }`}>
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder={isLoggedIn ? "Broadcast a whisper, drop a link, or record a voice note..." : "Sign in to leave a trace in the temple..."}
              disabled={!isLoggedIn}
              rows={2}
              className={`w-full bg-transparent text-sm sm:text-base text-zinc-900 placeholder-zinc-400 resize-none focus:outline-none font-serif leading-relaxed ${
                !isLoggedIn ? 'cursor-not-allowed text-zinc-400' : ''
              }`}
            />

            {audioBlobUrl && (
              <div className="flex items-center justify-between p-2.5 rounded-2xl bg-zinc-100/90 border border-zinc-200 shadow-inner">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center">
                    <Volume2 size={12} />
                  </div>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-700">Voice Note Ready</span>
                </div>
                <audio controls src={audioBlobUrl} className="h-7 max-w-[180px]" />
              </div>
            )}

            {error && (
              <p role="alert" className="font-mono text-[10px] uppercase tracking-wider text-rose-600">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between pt-2.5 border-t border-zinc-200/60">
              <button
                type="button"
                onClick={toggleRecording}
                disabled={!isLoggedIn}
                className={`px-3 py-1.5 rounded-full transition-all border flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider ${
                  !isLoggedIn
                    ? 'bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed opacity-60'
                    : isRecording
                    ? 'bg-rose-500 text-white border-rose-500 animate-pulse shadow-sm'
                    : 'bg-white text-zinc-700 border-zinc-200/90 hover:bg-zinc-50 shadow-xs'
                }`}
              >
                {isRecording ? <Square size={11} /> : <Mic size={11} />}
                <span>{isRecording ? 'Stop' : 'Voice'}</span>
              </button>

              {isLoggedIn ? (
                <button
                  type="button"
                  onClick={handleSendPost}
                  disabled={isSubmitting || (!postText.trim() && !audioBlobUrl)}
                  className="flex items-center gap-1.5 px-5 py-1.5 rounded-full bg-zinc-900 text-white font-medium text-[11px] shadow-xs hover:bg-zinc-800 active:scale-95 transition-all disabled:opacity-40 font-mono uppercase tracking-wider cursor-pointer"
                >
                  <span>{isSubmitting ? 'Transmitting...' : 'Broadcast'}</span>
                  <Send size={11} />
                </button>
              ) : (
                <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400 px-3 py-1">
                  <Lock size={11} className="text-zinc-400" />
                  <span>Sign in required</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* LOWER LEVEL: BALANCED TWO SEGMENTS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* LEFT SEGMENT: MANIFESTO & SACRED RITUAL SHRINES */}
          <section className="lg:col-span-5 flex flex-col justify-between">
            <div className="p-6 sm:p-8 rounded-3xl bg-white/80 backdrop-blur-2xl border border-zinc-200/90 shadow-[0_15px_35px_rgba(0,0,0,0.02)] space-y-6 flex-1 flex flex-col justify-between">
              
              <div className="space-y-6">
                <div className="space-y-3">
                  <h1 className="font-serif text-2xl sm:text-3xl font-normal text-zinc-900 tracking-tight leading-snug">
                    A real place on the internet where rituals work and every visitor leaves a trace.
                  </h1>
                  <p className="text-sm font-serif text-zinc-600 leading-relaxed">
                    The temple has its own memory, woven from your actions and whispers.
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t border-zinc-200/60">
                  <div className="flex items-center justify-between">
                    <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
                      Sanctuary Gates:
                    </h2>
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                  </div>
                  
                  <div className="space-y-2 font-serif">
                    {RITUALS.map((r) => {
                      const RitualIcon = r.icon;
                      return (
                        <Link
                          key={r.href}
                          href={r.href}
                          className={`block p-3.5 rounded-2xl bg-gradient-to-r from-zinc-50/90 to-white border border-zinc-200/80 transition-all duration-300 group shadow-2xs ${r.bg} ${r.border}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-xl bg-white border border-zinc-200/60 shadow-xs ${r.accent} group-hover:scale-110 transition-transform`}>
                                <RitualIcon size={16} />
                              </div>
                              <div>
                                <span className={`font-mono text-xs font-bold uppercase tracking-wider block ${r.accent}`}>
                                  {r.label}
                                </span>
                                <span className="text-xs text-zinc-500 group-hover:text-zinc-800 transition-colors">
                                  {r.desc}
                                </span>
                              </div>
                            </div>
                            <ExternalLink size={13} className="text-zinc-300 group-hover:text-zinc-900 transition-colors shrink-0" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* LIVE TEMPLE STATISTICS & FOOTER NOTE */}
              <div className="pt-5 border-t border-zinc-200/60 space-y-4">
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-900 text-white shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-xl bg-zinc-800 text-amber-400">
                      <Fingerprint size={16} />
                    </div>
                    <span className="font-mono text-xs uppercase tracking-wider text-zinc-300">Sanctuary Pulse</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 font-mono">
                    <span className="text-sm font-bold text-amber-300">{traceCount.toLocaleString()}</span>
                    <span className="text-[10px] uppercase tracking-widest text-zinc-400">traces recorded</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-serif text-zinc-500 px-1">
                  <span>The memory grows.</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-800 font-bold">Temple is working</span>
                </div>
              </div>

            </div>
          </section>

          {/* RIGHT SEGMENT: LIVING STREAM / TEMPLE LEDGER */}
          <section className="lg:col-span-7 flex flex-col">
            {!loaded ? (
              <div className="p-12 text-center rounded-3xl bg-white/40 border border-zinc-200/60 text-zinc-400 font-mono text-xs uppercase tracking-wider animate-pulse h-full flex items-center justify-center">
                Listening to the temple...
              </div>
            ) : posts.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-white/40 border border-zinc-200/60 text-zinc-500 font-mono text-xs uppercase tracking-wider h-full flex items-center justify-center">
                The logbook is empty. Leave the first trace.
              </div>
            ) : (
              <div className="bg-white/80 backdrop-blur-xl border border-zinc-200/90 rounded-3xl divide-y divide-zinc-200/60 shadow-[0_15px_35px_rgba(0,0,0,0.02)] overflow-hidden flex-1 flex flex-col justify-start">
                {posts.map((post) => {
                  const PostIcon = post.icon || Sparkles;

                  return (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      key={post.id}
                      className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-white transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider shrink-0 bg-white border-zinc-200/80 ${post.color || 'text-zinc-800'}`}>
                          <PostIcon size={11} className={post.color} />
                          <span>{post.label}</span>
                        </span>

                        <span className="font-mono text-xs font-semibold text-zinc-800 shrink-0">
                          {post.author}
                        </span>

                        <span className="text-zinc-300 shrink-0">•</span>

                        <div className="text-sm text-zinc-900 font-serif truncate">
                          {renderContentWithLinks(post.content)}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        {post.audioUrl && (
                          <audio controls src={post.audioUrl} className="h-6 w-32 rounded-lg" />
                        )}
                        <span className="font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                          {post.time}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </section>

        </div>

      </main>
    </div>
  );
}
