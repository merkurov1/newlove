'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ScanFace, Flame, Trash2, ReceiptText, Mic, Send, Sparkles, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/components/AuthContext';
import Header from '@/components/Header';

type ServiceType = 'WALL' | 'CAST' | 'ASH' | 'VIGIL' | 'DEBT';

export default function Home() {
  const [mode, setMode] = useState<'merkurov' | 'temple'>('merkurov');
  const { user, profile } = useAuth();
  
  // Temple state
  const [activeView, setActiveView] = useState<ServiceType>('WALL');
  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ashInput, setAshInput] = useState('');
  const [isAshBurnt, setIsAshBurnt] = useState(false);

  const userName = profile?.name || user?.user_metadata?.name || user?.email || 'Visitor';

  // Загружаем реальные записи из Supabase через API при монтировании или переходе в temple
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
        console.warn('Failed to fetch logs', e);
      }
    }
    if (mode === 'temple') {
      fetchLogs();
    }
  }, [mode, userName]);

  const handleSendPost = async () => {
    if (!postText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/temple_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'WHISPER',
          message: `${userName}: ${postText}`
        })
      });
      if (res.ok) {
        const json = await res.json();
        const newEntry = {
          id: json.data?.id || Date.now(),
          type: 'WHISPER',
          author: userName,
          time: 'just now',
          content: postText,
          icon: Sparkles,
          color: 'text-zinc-400'
        };
        setPosts([newEntry, ...posts]);
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
    <>
      <Header 
        currentMode={mode} 
        onModeChange={setMode} 
        activeTempleView={activeView}
        onTempleViewChange={setActiveView}
      />

      <main className="min-h-screen w-full bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] flex flex-col justify-between px-6 sm:px-12 pt-32 md:pt-40 pb-12 antialiased relative">
        
        {/* Subtle Paper Grain Overlay */}
        <div
          className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25'filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* ================= MODE 1: MERKUROV (ARCHIVE & PILLARS) ================= */}
        {mode === 'merkurov' && (
          <div className="w-full max-w-5xl mx-auto flex flex-col items-center justify-center my-auto text-center z-20 space-y-12">
            <div>
              <p className="font-serif italic text-zinc-600 text-base sm:text-lg md:text-xl mb-8 sm:mb-10 tracking-wide font-normal max-w-lg mx-auto">
                “Structure is the antidote to chaos.”
              </p>

              <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-serif font-normal tracking-tight leading-[0.95] text-[#111111] mb-12 sm:mb-16">
                Context Architecture <br />
                <span className="text-zinc-500 italic font-serif">&amp; Cultural Capital</span>
              </h1>

              <nav className="flex flex-wrap justify-center gap-6 sm:gap-10 md:gap-14 items-center font-mono text-sm sm:text-base uppercase tracking-[0.2em] mb-12">
                {[
                  { label: 'Art', href: '/heartandangel' },
                  { label: 'Selection', href: '/selection' },
                  { label: 'Advising', href: '/advising' },
                ].map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="group inline-flex items-center gap-2 px-3 py-2 text-[#111111] hover:text-zinc-600 transition-colors"
                  >
                    <span className="text-zinc-400 group-hover:text-zinc-700 transition-colors">[</span>
                    <span className="font-medium tracking-[0.2em] underline underline-offset-8 decoration-zinc-300 group-hover:decoration-black transition-colors">
                      {item.label}
                    </span>
                    <span className="text-zinc-400 group-hover:text-zinc-700 transition-colors">]</span>
                  </Link>
                ))}
              </nav>
            </div>

            {/* Lobby Portal Anchor */}
            <div>
              <Link
                href="/lobby"
                className="group inline-flex items-center gap-3 border border-zinc-900/20 bg-white/80 hover:bg-[#111111] text-[#111111] hover:text-[#FAF8F5] px-8 py-4 transition-all duration-300 ease-out backdrop-blur-sm shadow-sm rounded-full"
              >
                <span className="font-serif text-base sm:text-lg italic font-normal tracking-wide px-1">
                  Enter The Lobby
                </span>
                <ArrowUpRight
                  size={18}
                  className="text-zinc-600 group-hover:text-[#FAF8F5] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300"
                />
              </Link>
            </div>
          </div>
        )}

        {/* ================= MODE 2: DIGITAL TEMPLE (SANCTUARY) ================= */}
        {mode === 'temple' && (
          <div className="max-w-4xl mx-auto w-full relative z-20 my-auto">
            
            <section className="w-full space-y-8">
              <AnimatePresence mode="wait">
                
                {activeView === 'WALL' && (
                  <motion.div key="wall" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-8">
                    <div className="p-7 rounded-3xl bg-white/70 backdrop-blur-2xl border border-zinc-200 shadow-[0_12px_40px_rgba(0,0,0,0.03)] space-y-4">
                      <textarea
                        value={postText}
                        onChange={(e) => setPostText(e.target.value)}
                        placeholder="Leave a whisper, reflection, or record..."
                        className="w-full bg-transparent text-lg text-zinc-800 placeholder-zinc-400 resize-none focus:outline-none min-h-[110px] font-normal leading-relaxed"
                      />
                      <div className="flex items-center justify-between pt-2">
                        <button className="p-3 rounded-full bg-white text-zinc-600 hover:bg-zinc-100 transition-all shadow-sm border border-zinc-200">
                          <Mic size={18} />
                        </button>
                        <button
                          onClick={handleSendPost}
                          disabled={isSubmitting}
                          className="flex items-center gap-2.5 px-7 py-3 rounded-full bg-zinc-900 text-white font-medium text-sm shadow-xl hover:bg-zinc-800 active:scale-95 transition-all disabled:bg-zinc-300"
                        >
                          <span>{isSubmitting ? 'Transmitting...' : 'Transmit'}</span>
                          <Send size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {posts.map((post) => {
                        const PostIcon = post.icon || Sparkles;
                        return (
                          <div key={post.id} className="p-6 rounded-3xl bg-white/50 backdrop-blur-xl border border-zinc-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.015)] space-y-2.5">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2.5">
                                <PostIcon size={16} className={post.color || 'text-zinc-400'} />
                                <span className="font-semibold text-zinc-900 text-sm">{post.author}</span>
                              </div>
                              <span className="text-zinc-400 font-mono text-xs">{post.time}</span>
                            </div>
                            <p className="text-base text-zinc-800 leading-relaxed font-normal">{post.content}</p>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {activeView === 'CAST' && (
                  <motion.div key="cast" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="p-10 rounded-3xl bg-white/80 backdrop-blur-3xl border border-zinc-200 shadow-xl space-y-8">
                    <button onClick={() => setActiveView('WALL')} className="inline-flex items-center gap-2 text-xs font-mono font-medium text-zinc-500 hover:text-zinc-900 uppercase">
                      <ArrowLeft size={14} /> Return to Wall
                    </button>
                    <h2 className="text-3xl font-serif font-light text-zinc-900">Psychometric Cast</h2>
                    <div className="p-8 rounded-2xl bg-white/60 border border-zinc-200 space-y-5">
                      <div className="text-sm font-medium text-zinc-800">What currently occupies your mental bandwidth?</div>
                      <div className="space-y-3">
                        {['Information Overload', 'Unresolved Decisions', 'External Expectations'].map((opt, i) => (
                          <button
                            key={i}
                            onClick={() => publishRitualResult('CAST', `Status assigned: ${opt}`, 'CAST', ScanFace, 'text-indigo-500')}
                            className="w-full p-4 rounded-xl bg-white hover:bg-zinc-50 text-left text-sm font-medium text-zinc-800 border border-zinc-200 shadow-sm transition-all"
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeView === 'ASH' && (
                  <motion.div key="ash" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="p-10 rounded-3xl bg-white/80 backdrop-blur-3xl border border-zinc-200 shadow-xl space-y-8">
                    <button onClick={() => setActiveView('WALL')} className="inline-flex items-center gap-2 text-xs font-mono font-medium text-zinc-500 hover:text-zinc-900 uppercase">
                      <ArrowLeft size={14} /> Return to Wall
                    </button>
                    <h2 className="text-3xl font-serif font-light text-zinc-900">Data Incinerator</h2>
                    <textarea
                      value={ashInput}
                      onChange={(e) => setAshInput(e.target.value)}
                      placeholder="Record the noise..."
                      className="w-full p-5 rounded-2xl bg-white/60 border border-zinc-200 text-base text-zinc-800 placeholder-zinc-400 focus:outline-none min-h-[160px]"
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
                      className="w-full py-4 rounded-full bg-rose-600 text-white font-medium text-sm shadow-xl hover:bg-rose-700 transition-all"
                    >
                      {isAshBurnt ? 'Incinerating...' : 'Incinerate'}
                    </button>
                  </motion.div>
                )}

                {activeView === 'VIGIL' && (
                  <motion.div key="vigil" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="p-10 rounded-3xl bg-white/80 backdrop-blur-3xl border border-zinc-200 shadow-xl space-y-8 text-center">
                    <div className="text-left"><button onClick={() => setActiveView('WALL')} className="inline-flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase"><ArrowLeft size={14} /> Return</button></div>
                    <div className="py-6 space-y-5">
                      <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center"><Flame size={36} /></div>
                      <div className="text-4xl font-mono font-light text-zinc-900">23:41:09</div>
                      <button onClick={() => publishRitualResult('VIGIL', 'Flame extended', 'VIGIL', Flame, 'text-amber-500')} className="px-9 py-3.5 rounded-full bg-amber-600 text-white font-medium text-sm shadow-xl hover:bg-amber-700 transition-all">Add Spark</button>
                    </div>
                  </motion.div>
                )}

                {activeView === 'DEBT' && (
                  <motion.div key="debt" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="p-10 rounded-3xl bg-white/80 backdrop-blur-3xl border border-zinc-200 shadow-xl space-y-8 text-center">
                    <div className="text-left"><button onClick={() => setActiveView('WALL')} className="inline-flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase"><ArrowLeft size={14} /> Return</button></div>
                    <div className="py-6 space-y-5">
                      <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center"><ReceiptText size={36} /></div>
                      <div className="text-base font-mono text-emerald-800">BALANCE // 0.00 ZERO</div>
                      <button onClick={() => publishRitualResult('DEBT', 'Absolution receipt generated', 'DEBT', CheckCircle2, 'text-emerald-500')} className="px-9 py-3.5 rounded-full bg-emerald-700 text-white font-medium text-sm shadow-xl hover:bg-emerald-800 transition-all">Generate Receipt</button>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </section>
          </div>
        )}

        {/* --- FOOTER DIRECTORY --- */}
        <footer className="w-full max-w-6xl mx-auto flex justify-between items-center pt-6 border-t border-zinc-300/80 shrink-0 font-mono text-xs text-zinc-500 uppercase tracking-[0.25em] mt-16 z-20">
          <span>Merkurov Private Office</span>
          <span>Digital Heritage Architecture</span>
        </footer>

      </main>
    </>
  );
}
