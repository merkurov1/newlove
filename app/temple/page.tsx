'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ScanFace, 
  Flame, 
  Trash2, 
  ReceiptText, 
  Mic, 
  Square,
  Send, 
  Sparkles, 
  ArrowLeft,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import Header from '@/components/Header';

type ServiceType = 'WALL' | 'CAST' | 'ASH' | 'VIGIL' | 'DEBT';

export default function DigitalTemple() {
  const { profile } = useAuth();
  const [activeView, setActiveView] = useState<ServiceType>('WALL');
  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Ash ritual state
  const [ashInput, setAshInput] = useState('');
  const [isAshBurnt, setIsAshBurnt] = useState(false);

  const userName = profile?.name || 'Visitor';

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
              icon: item.event_type === 'VIGIL' ? Flame : item.event_type === 'ASH' ? Trash2 : item.event_type === 'CAST' ? ScanFace : Sparkles,
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

  const publishRitualResult = async (title: string, text: string, type: string, icon: any, color: string) => {
    const message = `${title}: ${text}`;
    try {
      await fetch('/api/temple_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: type, message })
      });
    } catch (e) {}

    const newEntry = {
      id: Date.now(),
      type,
      author: userName,
      time: 'just now',
      content: message,
      icon,
      color
    };
    setPosts([newEntry, ...posts]);
    setActiveView('WALL');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F6F4F0] via-[#F0ECE6] to-[#E8E3DA] text-zinc-900 font-sans selection:bg-zinc-900 selection:text-white relative overflow-x-hidden antialiased">
      
      {/* Background Soft Glows */}
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-tr from-amber-200/30 via-indigo-200/20 to-purple-200/30 blur-[140px] pointer-events-none rounded-full" />

      {/* Используем общий Header в режиме temple */}
      <Header activeTempleView={activeView} onTempleViewChange={setActiveView} />

      {/* --- MAIN CONTENT CONTAINER --- */}
      <main className="max-w-3xl mx-auto px-6 pt-36 pb-16 relative z-10">
        
        <AnimatePresence mode="wait">
          
          {/* 1. THE WALL VIEW */}
          {activeView === 'WALL' && (
            <motion.div
              key="wall"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* COMPACT & ELEGANT INPUT CONTAINER */}
              <div className="p-5 sm:p-6 rounded-3xl bg-white/70 backdrop-blur-2xl border border-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.02)] space-y-3">
                <textarea
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  placeholder="Leave a whisper, reflection, or record..."
                  rows={2}
                  className="w-full bg-transparent text-sm sm:text-base text-zinc-800 placeholder-zinc-400 resize-none focus:outline-none font-normal leading-relaxed"
                />

                <div className="flex items-center justify-between pt-2 border-t border-zinc-200/40">
                  <button
                    type="button"
                    onClick={toggleRecording}
                    className={`p-2.5 rounded-full transition-all shadow-sm border ${
                      isRecording 
                        ? 'bg-rose-500 text-white border-rose-500 animate-pulse' 
                        : 'bg-white/80 text-zinc-600 border-white/90 hover:bg-white'
                    }`}
                    title={isRecording ? 'Listening... Click to stop' : 'Record voice note'}
                  >
                    {isRecording ? <Square size={16} /> : <Mic size={16} />}
                  </button>

                  <button
                    onClick={handleSendPost}
                    disabled={isSubmitting || !postText.trim()}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-zinc-900 text-white font-medium text-xs sm:text-sm shadow-md hover:bg-zinc-800 active:scale-95 transition-all disabled:opacity-40"
                  >
                    <span>{isSubmitting ? 'Transmitting...' : 'Transmit'}</span>
                    <Send size={13} />
                  </button>
                </div>
              </div>

              {/* STREAM FEED */}
              <div className="space-y-3">
                {posts.map((post) => {
                  const PostIcon = post.icon || Sparkles;
                  return (
                    <div
                      key={post.id}
                      className="p-5 rounded-2xl bg-white/50 backdrop-blur-xl border border-white/70 shadow-[0_4px_15px_rgba(0,0,0,0.01)] space-y-2 hover:bg-white/70 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <PostIcon size={15} className={post.color || 'text-zinc-400'} />
                          <span className="font-semibold text-zinc-900 text-xs sm:text-sm">{post.author}</span>
                        </div>
                        <span className="text-zinc-400 font-mono text-[11px]">{post.time}</span>
                      </div>
                      <p className="text-sm sm:text-base text-zinc-800 leading-relaxed font-normal">
                        {post.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* 2. CAST SERVICE */}
          {activeView === 'CAST' && (
            <motion.div
              key="cast"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="p-8 rounded-3xl bg-white/80 backdrop-blur-3xl border border-white/90 shadow-xl space-y-6"
            >
              <button
                onClick={() => setActiveView('WALL')}
                className="inline-flex items-center gap-2 text-xs font-mono font-medium text-zinc-500 hover:text-zinc-900 transition-colors uppercase tracking-wider"
              >
                <ArrowLeft size={14} />
                <span>Return to Wall</span>
              </button>

              <div className="space-y-1">
                <h2 className="text-2xl font-serif font-light text-zinc-900">Psychometric Cast</h2>
                <p className="text-xs text-zinc-500 leading-relaxed">A rapid diagnostic mirror of attention.</p>
              </div>

              <div className="p-6 rounded-2xl bg-white/60 border border-white/90 space-y-4">
                <div className="text-sm font-medium text-zinc-800">What currently occupies your mental bandwidth?</div>
                <div className="space-y-2.5">
                  {['Information Overload', 'Unresolved Decisions', 'External Expectations'].map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => publishRitualResult('CAST', `Status assigned: ${opt}`, 'CAST', ScanFace, 'text-indigo-500')}
                      className="w-full p-3.5 rounded-xl bg-white/90 hover:bg-white text-left text-xs sm:text-sm font-medium text-zinc-800 transition-all border border-zinc-100 shadow-sm"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* 3. ASH SERVICE */}
          {activeView === 'ASH' && (
            <motion.div
              key="ash"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="p-8 rounded-3xl bg-white/80 backdrop-blur-3xl border border-white/90 shadow-xl space-y-6"
            >
              <button
                onClick={() => setActiveView('WALL')}
                className="inline-flex items-center gap-2 text-xs font-mono font-medium text-zinc-500 hover:text-zinc-900 transition-colors uppercase tracking-wider"
              >
                <ArrowLeft size={14} />
                <span>Return to Wall</span>
              </button>

              <div className="space-y-1">
                <h2 className="text-2xl font-serif font-light text-zinc-900">Data Incinerator</h2>
                <p className="text-xs text-zinc-500 leading-relaxed">Write what needs to be purged. Bytes dissolve irrevocably.</p>
              </div>

              <textarea
                value={ashInput}
                onChange={(e) => setAshInput(e.target.value)}
                placeholder="Record the noise..."
                className="w-full p-4 rounded-2xl bg-white/60 border border-white/90 text-sm sm:text-base text-zinc-800 placeholder-zinc-400 focus:outline-none min-h-[140px]"
              />

              <button
                onClick={() => {
                  setIsAshBurnt(true);
                  setTimeout(() => {
                    setAshInput('');
                    setIsAshBurnt(false);
                    publishRitualResult('ASH', 'Information noise incinerated', 'ASH', Trash2, 'text-rose-500');
                  }, 800);
                }}
                className="w-full py-3.5 rounded-full bg-rose-600 text-white font-medium text-sm shadow-xl hover:bg-rose-700 active:scale-98 transition-all"
              >
                {isAshBurnt ? 'Incinerating...' : 'Incinerate'}
              </button>
            </motion.div>
          )}

          {/* 4. VIGIL SERVICE */}
          {activeView === 'VIGIL' && (
            <motion.div
              key="vigil"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="p-8 rounded-3xl bg-white/80 backdrop-blur-3xl border border-white/90 shadow-xl space-y-6 text-center"
            >
              <div className="text-left">
                <button
                  onClick={() => setActiveView('WALL')}
                  className="inline-flex items-center gap-2 text-xs font-mono font-medium text-zinc-500 hover:text-zinc-900 transition-colors uppercase tracking-wider"
                >
                  <ArrowLeft size={14} />
                  <span>Return to Wall</span>
                </button>
              </div>

              <div className="py-4 space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Flame size={30} />
                </div>
                <div className="text-3xl font-mono font-light text-zinc-900">23:41:09</div>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">Sustain the collective flame of presence.</p>

                <button
                  onClick={() => publishRitualResult('VIGIL', 'Flame extended', 'VIGIL', Flame, 'text-amber-500')}
                  className="px-8 py-3 rounded-full bg-amber-600 text-white font-medium text-xs sm:text-sm shadow-lg hover:bg-amber-700 active:scale-95 transition-all"
                >
                  Add Spark
                </button>
              </div>
            </motion.div>
          )}

          {/* 5. DEBT SERVICE */}
          {activeView === 'DEBT' && (
            <motion.div
              key="debt"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="p-8 rounded-3xl bg-white/80 backdrop-blur-3xl border border-white/90 shadow-xl space-y-6 text-center"
            >
              <div className="text-left">
                <button
                  onClick={() => setActiveView('WALL')}
                  className="inline-flex items-center gap-2 text-xs font-mono font-medium text-zinc-500 hover:text-zinc-900 transition-colors uppercase tracking-wider"
                >
                  <ArrowLeft size={14} />
                  <span>Return to Wall</span>
                </button>
              </div>

              <div className="py-4 space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <ReceiptText size={30} />
                </div>
                <div className="text-sm font-mono text-emerald-800">BALANCE // 0.00 ZERO</div>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">Zero-balance receipt for phantom obligations.</p>

                <button
                  onClick={() => publishRitualResult('DEBT', 'Absolution receipt generated', 'DEBT', CheckCircle2, 'text-emerald-500')}
                  className="px-8 py-3 rounded-full bg-emerald-700 text-white font-medium text-xs sm:text-sm shadow-lg hover:bg-emerald-800 active:scale-95 transition-all"
                >
                  Generate Receipt
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

      </main>
    </div>
  );
}
