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
  Clock,
  User as UserIcon
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

// Вынесено из компонента: чистая функция, не пересоздаётся на каждый рендер
function getEventVisuals(eventType: string) {
  switch (eventType?.toUpperCase()) {
    case 'VIGIL':
    case 'VIGIL_SPARK':
      return { icon: Flame, color: 'text-amber-600', label: 'Vigil', badgeBg: 'bg-amber-50 border-amber-200/80 text-amber-900' };
    case 'ASH':
      return { icon: Trash2, color: 'text-rose-600', label: 'Let It Go', badgeBg: 'bg-rose-50 border-rose-200/80 text-rose-900' };
    case 'CAST':
      return { icon: Compass, color: 'text-indigo-600', label: 'Cast', badgeBg: 'bg-indigo-50 border-indigo-200/80 text-indigo-900' };
    case 'ABSOLUTION':
      return { icon: ShieldCheck, color: 'text-emerald-600', label: 'Absolution', badgeBg: 'bg-emerald-50 border-emerald-200/80 text-emerald-900' };
    case 'HEARTANDANGEL':
    case 'MEDITATION':
    case 'SILENCE':
      return { icon: Moon, color: 'text-purple-600', label: 'Calm', badgeBg: 'bg-purple-50 border-purple-200/80 text-purple-900' };
    case 'WHISPER':
      return { icon: Sparkles, color: 'text-zinc-900', label: 'Whisper', badgeBg: 'bg-zinc-100 border-zinc-200 text-zinc-800' };
    case 'AUDIO_WHISPER':
      return { icon: Mic, color: 'text-zinc-900', label: 'Voice', badgeBg: 'bg-zinc-100 border-zinc-200 text-zinc-800' };
    default:
      return { icon: Radio, color: 'text-zinc-600', label: eventType || 'Log', badgeBg: 'bg-zinc-100 border-zinc-200 text-zinc-800' };
  }
}

// Сегодня — только время, раньше — дата + время
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
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-tr from-amber-200/20 via-indigo-200/10 to-purple-200/20 blur-[140px] pointer-events-none rounded-full" />

      <Header />

      <main className="max-w-7xl mx-auto px-6 pt-36 pb-24 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT SIDEBAR: MANIFEST & RITUALS */}
          <aside className="lg:col-span-4 lg:sticky lg:top-32 space-y-6">
            <div className="p-6 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-2xl border border-zinc-200/95 shadow-[0_20px_40px_rgba(0,0,0,0.03)] space-y-6">
              
              <div className="space-y-3">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500 bg-zinc-100 px-3 py-1 rounded-md">
                  Digital Temple
                </span>
                <h1 className="font-serif text-2xl sm:text-3xl font-normal text-zinc-900 tracking-tight">
                  Digital Temple
                </h1>
                <p className="text-base sm:text-lg font-serif text-zinc-800 leading-relaxed">
                  A real place on the internet where rituals work and every visitor leaves a trace.
                </p>
              </div>

              <div className="space-y-4 pt-4 border-t border-zinc-200/60">
                <h2 className="font-mono text-xs uppercase tracking-[0.15em] text-zinc-500">
                  Five Temple Rituals:
                </h2>
                
                <div className="space-y-3 font-serif">
                  <Link href="/cast" className="block p-3.5 sm:p-4 rounded-2xl bg-zinc-50/90 border border-zinc-200/80 hover:bg-white hover:border-zinc-300 transition-all group">
                    <div className="flex items-center justify-between font-mono text-xs font-bold text-zinc-900 uppercase tracking-wider mb-1">
                      <span>CAST</span>
                      <ExternalLink size={14} className="text-zinc-400 group-hover:text-zinc-900 transition-colors" />
                    </div>
                    <p className="text-sm sm:text-base text-zinc-800 leading-normal">
                      Psyche assessment, Agency Index & archetype.
                    </p>
                  </Link>

                  <Link href="/vigil" className="block p-3.5 sm:p-4 rounded-2xl bg-zinc-50/90 border border-zinc-200/80 hover:bg-white hover:border-zinc-300 transition-all group">
                    <div className="flex items-center justify-between font-mono text-xs font-bold text-zinc-900 uppercase tracking-wider mb-1">
                      <span>VIGIL</span>
                      <ExternalLink size={14} className="text-zinc-400 group-hover:text-zinc-900 transition-colors" />
                    </div>
                    <p className="text-sm sm:text-base text-zinc-800 leading-normal">
                      Vigil & spark in the temple.
                    </p>
                  </Link>

                  <Link href="/absolution" className="block p-3.5 sm:p-4 rounded-2xl bg-zinc-50/90 border border-zinc-200/80 hover:bg-white hover:border-zinc-300 transition-all group">
                    <div className="flex items-center justify-between font-mono text-xs font-bold text-zinc-900 uppercase tracking-wider mb-1">
                      <span>ABSOLUTION</span>
                      <ExternalLink size={14} className="text-zinc-400 group-hover:text-zinc-900 transition-colors" />
                    </div>
                    <p className="text-sm sm:text-base text-zinc-800 leading-normal">
                      Confession & release from anxiety.
                    </p>
                  </Link>

                  <Link href="/heartandangel/calm" className="block p-3.5 sm:p-4 rounded-2xl bg-zinc-50/90 border border-zinc-200/80 hover:bg-white hover:border-zinc-300 transition-all group">
                    <div className="flex items-center justify-between font-mono text-xs font-bold text-zinc-900 uppercase tracking-wider mb-1">
                      <span>CALM</span>
                      <ExternalLink size={14} className="text-zinc-400 group-hover:text-zinc-900 transition-colors" />
                    </div>
                    <p className="text-sm sm:text-base text-zinc-800 leading-normal">
                      Finding calm & centering attention.
                    </p>
                  </Link>

                  <Link href="/heartandangel/letitgo" className="block p-3.5 sm:p-4 rounded-2xl bg-zinc-50/90 border border-zinc-200/80 hover:bg-white hover:border-zinc-300 transition-all group">
                    <div className="flex items-center justify-between font-mono text-xs font-bold text-zinc-900 uppercase tracking-wider mb-1">
                      <span>LET IT GO</span>
                      <ExternalLink size={14} className="text-zinc-400 group-hover:text-zinc-900 transition-colors" />
                    </div>
                    <p className="text-sm sm:text-base text-zinc-800 leading-normal">
                      Release problems and burdens.
                    </p>
                  </Link>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-200/60 space-y-2 text-sm sm:text-base font-serif text-zinc-800 leading-relaxed">
                <p>
                  The temple has its own memory, built from visitor actions and woven into the place.
                </p>
                <p className="font-mono text-xs uppercase tracking-wider text-zinc-900 font-bold pt-1">
                  The temple is working.
                </p>
              </div>

            </div>
          </aside>

          {/* RIGHT COLUMN: MAIN INPUT & LIVE FEED */}
          <div className="lg:col-span-8 space-y-8">

            {/* INPUT BOX */}
            {!isLoading && !user ? (
              <div className="p-8 rounded-3xl bg-white/70 backdrop-blur-xl border border-zinc-200/80 shadow-[0_10px_30px_rgba(0,0,0,0.02)] text-center space-y-4">
                <p className="font-serif text-zinc-700 text-sm">
                  Authentication required to broadcast whispers and voice notes into the temple.
                </p>
                <div>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-900 text-white font-mono text-xs uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all shadow-sm"
                  >
                    Sign In to Participate
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-3xl bg-white/85 backdrop-blur-2xl border border-zinc-200/90 shadow-[0_20px_40px_rgba(0,0,0,0.03)] space-y-4 transition-all">
                <textarea
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  placeholder="Broadcast a whisper, drop a link, or record a voice note..."
                  rows={3}
                  className="w-full bg-transparent text-base text-zinc-900 placeholder-zinc-400 resize-none focus:outline-none font-serif leading-relaxed"
                />

                {audioBlobUrl && (
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-100/80 border border-zinc-200">
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
                        ? 'bg-rose-500 text-white border-rose-500 animate-pulse shadow-sm'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 shadow-sm'
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
            )}

            {/* FEED / STREAM */}
            <div className="space-y-4 pt-2">
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
                  const isLogEvent = post.type !== 'WHISPER' && post.type !== 'AUDIO_WHISPER';

                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={post.id}
                      className={`backdrop-blur-xl transition-all duration-300 ${
                        isLogEvent
                          ? 'p-5 rounded-2xl bg-white/50 border border-zinc-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.01)] hover:bg-white/70'
                          : 'p-6 rounded-3xl bg-white/85 border border-zinc-200/90 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_15px_35px_rgba(0,0,0,0.04)]'
                      }`}
                    >
                      {!isLogEvent ? (
                        <div className="space-y-3.5">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center font-mono text-[10px]">
                                {post.author ? post.author.substring(0, 2).toUpperCase() : 'V'}
                              </div>
                              <span className="font-semibold text-zinc-900 text-sm tracking-tight">{post.author}</span>
                              <span className="text-zinc-300">•</span>
                              <span className="text-zinc-400 font-mono text-[10px] uppercase tracking-wider bg-zinc-100 px-2 py-0.5 rounded-md">
                                {post.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-zinc-400 font-mono text-[11px]">
                              <Clock size={11} />
                              <span>{post.time}</span>
                            </div>
                          </div>

                          <div className="text-base text-zinc-800 leading-relaxed font-serif break-words pl-8">
                            {renderContentWithLinks(post.content)}
                          </div>

                          {post.audioUrl && (
                            <div className="pt-1 pl-8">
                              <audio controls src={post.audioUrl} className="w-full h-9 rounded-xl" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-start gap-4">
                          <div className={`p-2 rounded-xl shrink-0 mt-0.5 border ${post.badgeBg || 'bg-zinc-100 border-zinc-200 text-zinc-800'}`}>
                            <PostIcon size={16} className={post.color} />
                          </div>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`font-mono text-[10px] uppercase tracking-[0.15em] px-2.5 py-0.5 rounded-full border font-semibold ${post.badgeBg || 'bg-zinc-100 border-zinc-200 text-zinc-800'}`}>
                                  {post.label}
                                </span>
                                <span className="text-zinc-400">•</span>
                                <span className="text-zinc-600 font-medium text-xs flex items-center gap-1">
                                  <UserIcon size={12} className="text-zinc-400" />
                                  {post.author}
                                </span>
                              </div>
                              <span className="text-zinc-400 font-mono text-[10px]">{post.time}</span>
                            </div>
                            <div className="text-sm text-zinc-800 font-serif leading-relaxed break-words pt-1">
                              {renderContentWithLinks(post.content)}
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
