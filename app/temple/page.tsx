'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  author: string;
  time: string;
  content: string;
  audioUrl?: string | null;
  icon?: any;
  color?: string;
  badgeBg?: string;
}

export default function TemplePage() {
  const { user, profile, isLoading } = useAuth();
  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState<TemplePost[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const userName = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Visitor';

  // Очистка URL аудио при размонтировании
  useEffect(() => {
    return () => {
      if (audioBlobUrl) {
        URL.revokeObjectURL(audioBlobUrl);
      }
    };
  }, [audioBlobUrl]);

  // Функция маппинга событий с улучшенными визуальными стилями и плашками
  const getEventVisuals = (eventType: string) => {
    switch (eventType?.toUpperCase()) {
      case 'VIGIL':
        return { icon: Flame, color: 'text-amber-600', label: 'Vigil', badgeBg: 'bg-amber-50 border-amber-200/80 text-amber-900' };
      case 'ASH':
        return { icon: Trash2, color: 'text-rose-600', label: 'Let It Go', badgeBg: 'bg-rose-50 border-rose-200/80 text-rose-900' };
      case 'CAST':
        return { icon: Compass, color: 'text-indigo-600', label: 'Cast Archetype', badgeBg: 'bg-indigo-50 border-indigo-200/80 text-indigo-900' };
      case 'ABSOLUTION':
      case 'PIERROT':
        return { icon: ShieldCheck, color: 'text-emerald-600', label: 'Absolution', badgeBg: 'bg-emerald-50 border-emerald-200/80 text-emerald-900' };
      case 'MEDITATION':
      case 'SILENCE':
        return { icon: Moon, color: 'text-purple-600', label: 'Silence', badgeBg: 'bg-purple-50 border-purple-200/80 text-purple-900' };
      default:
        return { icon: Radio, color: 'text-zinc-600', label: eventType || 'Log', badgeBg: 'bg-zinc-100 border-zinc-200 text-zinc-800' };
    }
  };

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch('/api/temple_logs');
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.data) && json.data.length > 0) {
            const formatted = json.data.map((item: any) => {
              const type = item.event_type || 'WHISPER';
              const visuals = getEventVisuals(type);
              return {
                id: item.id || Date.now(),
                type: type,
                author: item.author || 'Anonymous',
                time: 'recently',
                content: item.message,
                audioUrl: item.audio_url || null,
                icon: visuals.icon,
                color: visuals.color,
                badgeBg: visuals.badgeBg
              };
            });
            setPosts(formatted);
          }
        }
      } catch (e) {
        console.warn('Failed to fetch temple logs', e);
      }
    }
    fetchLogs();
  }, []);

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }

    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioBlobUrl(url);
        stream.getTracks().forEach(track => track.stop());
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
        recognition.lang = 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          setPostText(transcript);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (e) {
      console.error('Microphone access error:', e);
      alert('Could not access microphone.');
      setIsRecording(false);
    }
  };

  const handleSendPost = async () => {
    if ((!postText.trim() && !audioBlobUrl) || isSubmitting) return;
    setIsSubmitting(true);
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

      if (res.ok) {
        const json = await res.json();
        const visuals = getEventVisuals(audioBlobUrl ? 'AUDIO_WHISPER' : 'WHISPER');
        const newItem: TemplePost = {
          id: json.data?.id || Date.now(),
          type: audioBlobUrl ? 'AUDIO_WHISPER' : 'WHISPER',
          author: userName,
          time: 'just now',
          content: postText || 'Voice transmission',
          audioUrl: audioBlobUrl,
          icon: audioBlobUrl ? Mic : Sparkles,
          color: 'text-zinc-900',
          badgeBg: visuals.badgeBg
        };
        setPosts([newItem, ...posts]);
        setPostText('');
        setAudioBlobUrl(null);
      }
    } catch (e) {
      console.error('Failed to transmit post', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderContentWithLinks = (text: string) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        try {
          const hostname = new URL(part).hostname.replace('www.', '');
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-zinc-100 border border-zinc-200 text-zinc-900 text-xs font-mono hover:bg-zinc-200 transition-colors my-1 break-all"
            >
              <ExternalLink size={12} className="shrink-0 text-zinc-500" />
              <span>{hostname}</span>
            </a>
          );
        } catch {
          return (
            <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-zinc-900 underline underline-offset-4 break-all">
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

      <main className="max-w-2xl mx-auto px-6 pt-36 pb-24 relative z-10 space-y-8">
        
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
          {posts.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-white/40 border border-zinc-200/60 text-zinc-500 font-mono text-xs uppercase tracking-wider">
              No entries in the temple logbook yet.
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
                            {post.type.toLowerCase()}
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
                              {post.type}
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

      </main>
    </div>
  );
}
