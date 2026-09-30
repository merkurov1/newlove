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
              color: item.event_type === 'VIGIL' ? 'text-amber-600' : item.event_type === 'ASH' ? 'text-rose-600' : 'text-zinc-600'
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
          color: 'text-zinc-900'
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

      <main className="max-w-2xl mx-auto px-6 pt-32 pb-24 relative z-10 space-y-10">
        
        {/* INPUT BOX (Starts immediately) */}
        {!isLoading && !user ? (
          <div className="p-8 rounded-2xl bg-white/70 backdrop-blur-xl border border-zinc-200/80 shadow-sm text-center space-y-4">
            <p className="font-serif text-zinc-700 text-sm">
              Authentication required to broadcast whispers and voice notes into the temple.
            </p>
            <div>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-zinc-900 text-white font-mono text-xs uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all shadow-sm"
              >
                Sign In to Participate
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-white/85 backdrop-blur-xl border border-zinc-200/80 shadow-[0_10px_30px_rgba(0,0,0,0.02)] space-y-4">
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder="Broadcast a whisper, drop a link, or record a voice note..."
              rows={3}
              className="w-full bg-transparent text-base text-zinc-900 placeholder-zinc-400 resize-none focus:outline-none font-serif leading-relaxed"
            />

            {audioBlobUrl && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-100 border border-zinc-200">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center">
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
                className={`px-3.5 py-2 rounded-full transition-all border flex items-center gap-2 text-xs font-mono uppercase tracking-wider ${
                  isRecording 
                    ? 'bg-rose-500 text-white border-rose-500 animate-pulse' 
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                {isRecording ? <Square size={13} /> : <Mic size={13} />}
                <span>{isRecording ? 'Stop' : 'Voice Note'}</span>
              </button>

              <button
                type="button"
                onClick={handleSendPost}
                disabled={isSubmitting || (!postText.trim() && !audioBlobUrl)}
                className="flex items-center gap-2 px-6 py-2 rounded-full bg-zinc-900 text-white font-medium text-xs shadow-sm hover:bg-zinc-800 active:scale-95 transition-all disabled:opacity-40 font-mono uppercase tracking-wider"
              >
                <span>{isSubmitting ? 'Transmitting...' : 'Broadcast'}</span>
                <Send size={13} />
              </button>
            </div>
          </div>
        )}

        {/* FEED / STREAM WITH SEPARATE DESIGNS */}
        <div className="space-y-3 pt-2">
          {posts.length === 0 ? (
            <div className="p-10 text-center rounded-2xl bg-white/40 border border-zinc-200/60 text-zinc-500 font-mono text-xs uppercase tracking-wider">
              No entries in the temple logbook yet.
            </div>
          ) : (
            posts.map((post) => {
              const PostIcon = post.icon || Sparkles;
              const isLogEvent = post.type !== 'WHISPER' && post.type !== 'AUDIO_WHISPER';

              return (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={post.id}
                  className={`backdrop-blur-md transition-all duration-300 ${
                    isLogEvent 
                      ? 'p-4 rounded-xl bg-white/30 border border-zinc-300/50 shadow-none' 
                      : 'p-5 rounded-2xl bg-white/80 border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.02)]'
                  }`}
                >
                  {/* DESIGN A: User Post / Whisper */}
                  {!isLogEvent ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="font-semibold text-zinc-900 text-sm">{post.author}</span>
                          <span className="text-zinc-300">•</span>
                          <span className="text-zinc-400 font-mono text-[10px] uppercase tracking-wider">{post.type.toLowerCase()}</span>
                        </div>
                        <span className="text-zinc-400 font-mono text-[11px]">{post.time}</span>
                      </div>

                      <div className="text-base text-zinc-800 leading-relaxed font-serif break-words">
                        {renderContentWithLinks(post.content)}
                      </div>

                      {post.audioUrl && (
                        <div className="pt-1">
                          <audio controls src={post.audioUrl} className="w-full h-9 rounded-xl" />
                        </div>
                      )}
                    </div>
                  ) : (
                    /* DESIGN B: System Log Event (Vigil, Ash, etc.) */
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded-lg bg-zinc-200/40 text-zinc-700 mt-0.5 shrink-0">
                        <PostIcon size={13} className={post.color} />
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">
                            {post.type} // {post.author}
                          </span>
                          <span className="text-zinc-400 font-mono text-[10px]">{post.time}</span>
                        </div>
                        <div className="text-sm text-zinc-700 font-serif leading-relaxed break-words">
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
