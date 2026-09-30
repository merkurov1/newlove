'use client';

import React, { useState, useEffect, useRef } from 'react';
import Header from '@/components/Header';
import { useAuth } from '@/components/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, Mic, Square, Trash2, Flame, CheckCircle2, Radio } from 'lucide-react';

export default function TemplePage() {
  const { profile } = useAuth();
  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  const userName = profile?.name || 'Visitor';

  // Загрузка логов храма из API
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
              author: userName,
              time: 'recently',
              content: item.message,
              icon: item.event_type === 'VIGIL' ? Flame : item.event_type === 'ASH' ? Trash2 : item.event_type === 'CAST' ? Radio : Sparkles,
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
  }, [userName]);

  // Голосовой ввод / транскрипция
  const toggleRecording = () => {
    if (isRecording) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => setIsRecording(true);
      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setPostText((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      setIsRecording(false);
    }
  };

  // Отправка сообщения в ленту
  const handleSendPost = async () => {
    if (!postText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/temple_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'WHISPER',
          message: postText
        })
      });
      if (res.ok) {
        const json = await res.json();
        const newItem = {
          id: json.data?.id || Date.now(),
          type: 'WHISPER',
          author: userName,
          time: 'just now',
          content: postText,
          icon: Sparkles,
          color: 'text-zinc-400'
        };
        setPosts([newItem, ...posts]);
        setPostText('');
      }
    } catch (e) {
      console.error('Failed to transmit post', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F6F4F0] via-[#F0ECE6] to-[#E8E3DA] text-zinc-900 font-sans selection:bg-zinc-900 selection:text-white relative overflow-x-hidden antialiased">
      
      {/* Background Soft Glows */}
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-tr from-amber-200/30 via-indigo-200/20 to-purple-200/30 blur-[140px] pointer-events-none rounded-full" />

      {/* Header */}
      <Header />

      {/* --- MAIN CONTENT CONTAINER --- */}
      <main className="max-w-3xl mx-auto px-6 pt-36 pb-24 relative z-10 space-y-8">
        
        {/* HERO TITLE */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/70 backdrop-blur-md text-zinc-700 text-xs font-mono uppercase tracking-widest border border-white/80 shadow-sm">
            <Radio size={14} className="text-indigo-600 animate-pulse" />
            Sanctuary Transmission Stream
          </div>
          <h1 className="text-3xl lg:text-4xl font-light tracking-tight text-zinc-900 font-serif">
            Digital Temple Wall
          </h1>
        </div>

        {/* TOP INPUT CONTAINER (Строка ввода: текст, ссылки, голос) */}
        <div className="p-6 rounded-3xl bg-white/80 backdrop-blur-2xl border border-white/90 shadow-[0_15px_40px_rgba(0,0,0,0.03)] space-y-4">
          <textarea
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            placeholder="Transmit a reflection, link, or record a voice note..."
            rows={3}
            className="w-full bg-transparent text-base text-zinc-800 placeholder-zinc-400 resize-none focus:outline-none font-normal leading-relaxed"
          />

          <div className="flex items-center justify-between pt-3 border-t border-zinc-200/50">
            <button
              type="button"
              onClick={toggleRecording}
              className={`p-3 rounded-full transition-all shadow-sm border flex items-center gap-2 text-xs font-mono uppercase ${
                isRecording 
                  ? 'bg-rose-500 text-white border-rose-500 animate-pulse' 
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
              title={isRecording ? 'Listening... Click to stop' : 'Record voice note'}
            >
              {isRecording ? <Square size={16} /> : <Mic size={16} />}
              <span className="hidden sm:inline">{isRecording ? 'Recording...' : 'Voice Note'}</span>
            </button>

            <button
              onClick={handleSendPost}
              disabled={isSubmitting || !postText.trim()}
              className="flex items-center gap-2 px-7 py-3 rounded-full bg-zinc-900 text-white font-medium text-xs sm:text-sm shadow-md hover:bg-zinc-800 active:scale-95 transition-all disabled:opacity-40"
            >
              <span>{isSubmitting ? 'Transmitting...' : 'Transmit'}</span>
              <Send size={14} />
            </button>
          </div>
        </div>

        {/* LIVE STREAM FEED (Лента событий и контента) */}
        <div className="space-y-4">
          <div className="font-mono text-xs uppercase tracking-widest text-zinc-400 px-2">
            Active Stream ({posts.length})
          </div>

          {posts.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-white/40 border border-white/60 text-zinc-500 font-mono text-xs uppercase tracking-wider">
              No active transmissions yet. Be the first to broadcast.
            </div>
          ) : (
            posts.map((post) => {
              const PostIcon = post.icon || Sparkles;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={post.id}
                  className="p-6 rounded-3xl bg-white/70 backdrop-blur-xl border border-white/80 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-3 hover:bg-white/90 transition-all duration-300"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-zinc-100 text-zinc-800">
                        <PostIcon size={16} className={post.color || 'text-zinc-600'} />
                      </div>
                      <span className="font-semibold text-zinc-900 text-sm">{post.author}</span>
                    </div>
                    <span className="text-zinc-400 font-mono text-xs">{post.time}</span>
                  </div>
                  <p className="text-base text-zinc-800 leading-relaxed font-normal pl-1">
                    {post.content}
                  </p>
                </motion.div>
              );
            })
          )}
        </div>

      </main>
    </div>
  );
}
