'use client';

import React, { useState, useEffect, useRef } from 'react';
import Header from '@/components/Header';
import { useAuth } from '@/components/AuthContext';
import { motion } from 'framer-motion';
import { Sparkles, Send, Mic, Square, Trash2, Flame, Radio, ExternalLink, Volume2 } from 'lucide-react';
import Link from 'next/link';

export default function TemplePage() {
  const { user, profile, isLoading } = useAuth();
  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const userName = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Visitor';

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch('/api/temple_logs');
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.data) && json.data.length > 0) {
            const formatted = json.data.map((item: any) => ({
              id: item.id || Date.now(),
              type: item.event_type || 'WHISPER',
              author: item.author || 'Anonymous',
              time: 'recently',
              content: item.message,
              audioUrl: item.audio_url || null,
              icon: item.event_type === 'VIGIL' ? Flame : item.event_type === 'ASH' ? Trash2 : Radio,
              color: item.event_type === 'VIGIL' ? 'text-amber-500' : item.event_type === 'ASH' ? 'text-rose-500' : 'text-indigo-500'
            }));
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
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
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

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
        const newItem = {
          id: json.data?.id || Date.now(),
          type: audioBlobUrl ? 'AUDIO_WHISPER' : 'WHISPER',
          author: userName,
          time: 'just now',
          content: postText || 'Voice transmission',
          audioUrl: audioBlobUrl,
          icon: audioBlobUrl ? Mic : Sparkles,
          color: audioBlobUrl ? 'text-rose-500' : 'text-zinc-400'
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
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-900 text-sm font-medium hover:bg-zinc-200 transition-colors my-1 break-all"
            >
              <ExternalLink size={13} className="shrink-0" />
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
      
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-tr from-amber-200/20 via-zinc-200/20 to-stone-300/20 blur-[140px] pointer-events-none rounded-full" />

      <Header />

      <main className="max-w-4xl mx-auto px-6 pt-36 pb-24 relative z-10">
        
        {/* TOP LAYOUT: Title & Info Side Panel */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-12 items-end border-b border-zinc-300/60 pb-8">
          <div className="md:col-span-8 space-y-3">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500">Sanctuary</span>
            <h1 className="text-4xl sm:text-5xl font-serif font-light text-zinc-900 tracking-tight">The Temple</h1>
          </div>
          
          <div className="md:col-span-4 md:text-right space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 block">Stream Info</span>
            <p className="text-xs font-serif text-zinc-600 italic">
              Whispers, voice notes, and verified thoughts in the stream.
            </p>
          </div>
        </div>

        {/* CONTENT LAYOUT: Input & Stream separated */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          
          {/* LEFT / MAIN COLUMN: Stream and Posts */}
          <div className="md:col-span-7 space-y-6">
            
            {/* STREAM FEED */}
            <div className="space-y-4">
              {posts.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-white/40 border border-white/60 text-zinc-500 font-mono text-xs uppercase tracking-wider">
                  No entries in the logbook yet.
                </div>
              ) : (
                posts.map((post) => {
                  const PostIcon = post.icon || Sparkles;
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={post.id}
                      className="p-6 rounded-3xl bg-white/70 backdrop-blur-xl border border-white/80 shadow-[0_10px_30px_rgba(0,0,0,0.02)] space-y-4 hover:bg-white/90 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-2xl bg-zinc-100 text-zinc-800 shadow-sm">
                            <PostIcon size={15} className={post.color || 'text-zinc-600'} />
                          </div>
                          <div>
                            <span className="font-semibold text-zinc-900 text-sm block">{post.author}</span>
                            <span className="text-zinc-400 font-mono text-[10px] uppercase tracking-wider">{post.type}</span>
                          </div>
                        </div>
                        <span className="text-zinc-400 font-mono text-xs">{post.time}</span>
                      </div>

                      <div className="text-base text-zinc-800 leading-relaxed font-serif pl-1 break-words">
                        {renderContentWithLinks(post.content)}
                      </div>

                      {post.audioUrl && (
                        <div className="pt-2">
                          <audio controls src={post.audioUrl} className="w-full rounded-xl" />
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>

          </div>

          {/* RIGHT COLUMN: Transmission / Input Module */}
          <div className="md:col-span-5 space-y-6">
            <div className="sticky top-28">
              {!isLoading && !user ? (
                <div className="p-8 rounded-3xl bg-white/70 backdrop-blur-2xl border border-white/80 shadow-[0_15px_40px_rgba(0,0,0,0.03)] text-center space-y-4">
                  <p className="font-serif text-zinc-700 text-sm">
                    Authentication required to broadcast whispers and voice notes.
                  </p>
                  <div>
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-900 text-white font-mono text-xs uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all shadow-md"
                    >
                      Sign In
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-3xl bg-white/80 backdrop-blur-2xl border border-white/90 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-4">
                  <div className="font-mono text-xs uppercase tracking-wider text-zinc-500 mb-1">
                    New Transmission
                  </div>
                  
                  <textarea
                    value={postText}
                    onChange={(e) => setPostText(e.target.value)}
                    placeholder="Broadcast a whisper or record a voice note..."
                    rows={4}
                    className="w-full bg-transparent text-sm text-zinc-900 placeholder-zinc-400 resize-none focus:outline-none font-normal leading-relaxed font-serif"
                  />

                  {audioBlobUrl && (
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-100/80 border border-zinc-200">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center">
                          <Volume2 size={12} />
                        </div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-700">Voice Ready</span>
                      </div>
                      <audio controls src={audioBlobUrl} className="h-7 max-w-[150px]" />
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-zinc-200/60">
                    <button
                      type="button"
                      onClick={toggleRecording}
                      className={`px-3 py-2 rounded-full transition-all shadow-sm border flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider ${
                        isRecording 
                          ? 'bg-rose-500 text-white border-rose-500 animate-pulse' 
                          : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      {isRecording ? <Square size={12} /> : <Mic size={12} />}
                      <span>{isRecording ? 'Stop' : 'Voice'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSendPost}
                      disabled={isSubmitting || (!postText.trim() && !audioBlobUrl)}
                      className="flex items-center gap-2 px-6 py-2 rounded-full bg-zinc-900 text-white font-medium text-xs shadow-md hover:bg-zinc-800 active:scale-95 transition-all disabled:opacity-40 font-mono uppercase tracking-wider"
                    >
                      <span>{isSubmitting ? '...' : 'Broadcast'}</span>
                      <Send size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
