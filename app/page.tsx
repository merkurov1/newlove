'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ScanFace, Flame, Trash2, ReceiptText, Mic, Send, Sparkles, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/components/AuthContext';

type ServiceType = 'WALL' | 'CAST' | 'ASH' | 'VIGIL' | 'DEBT';

const INITIAL_POSTS = [
  {
    id: 1,
    type: 'VIGIL',
    author: 'Anonymous',
    time: '2m ago',
    content: 'Spark added to the collective beacon. Extended by 24 hours.',
    icon: Flame,
    color: 'text-amber-500'
  },
  {
    id: 2,
    type: 'ASH',
    author: 'Anton M.',
    time: '14m ago',
    content: 'Information noise incinerated. The canvas remains pristine.',
    icon: Trash2,
    color: 'text-rose-500'
  },
  {
    id: 3,
    type: 'CAST',
    author: 'Visitor',
    time: '1h ago',
    content: 'Perceptual archetype manifested: UNFRAMED.',
    icon: ScanFace,
    color: 'text-indigo-500'
  }
];

export default function Home() {
  // Вы можете менять дефолтный режим с 'merkurov' на 'temple'
  const [mode, setMode] = useState<'merkurov' | 'temple'>('merkurov');
  const { user, profile } = useAuth();
  
  // Temple state
  const [activeView, setActiveView] = useState<ServiceType>('WALL');
  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const [ashInput, setAshInput] = useState('');
  const [isAshBurnt, setIsAshBurnt] = useState(false);

  const userName = profile?.name || user?.user_metadata?.name || user?.email || 'Visitor';

  const handleSendPost = () => {
    if (!postText.trim()) return;
    const newEntry = {
      id: Date.now(),
      type: 'WHISPER',
      author: userName,
      time: 'just now',
      content: postText,
      icon: Sparkles,
      color: 'text-zinc-400'
    };
    setPosts([newEntry, ...posts]);
    setPostText('');
  };

  const publishRitualResult = (title: string, text: string, type: string, icon: any, color: string) => {
    const newEntry = {
      id: Date.now(),
      type,
      author: userName,
      time: 'just now',
      content: `${title}: ${text}`,
      icon,
      color
    };
    setPosts([newEntry, ...posts]);
    setActiveView('WALL');
  };

  return (
    <main className="min-h-screen w-full bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] flex flex-col justify-between px-6 sm:px-12 pt-28 md:pt-36 pb-12 antialiased relative">
      
      {/* Subtle Paper Grain Overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25'filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* MODE SELECTOR BANNER / TAB BAR */}
      <div className="w-full max-w-6xl mx-auto mb-8 flex justify-center">
        <div className="inline-flex items-center gap-2 p-1.5 rounded-full bg-white/80 backdrop-blur-md border border-zinc-200/80 shadow-sm">
          <button
            onClick={() => setMode('merkurov')}
            className={`px-6 py-2 rounded-full text-xs font-mono uppercase tracking-widest transition-all ${
              mode === 'merkurov'
                ? 'bg-zinc-900 text-white shadow-md font-medium'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            Merkurov // Archive
          </button>
          <button
            onClick={() => setMode('temple')}
            className={`px-6 py-2 rounded-full text-xs font-mono uppercase tracking-widest transition-all ${
              mode === 'temple'
                ? 'bg-zinc-900 text-white shadow-md font-medium'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            Digital Temple // Sanctuary
          </button>
        </div>
      </div>

      {/* ================= MODE 1: MERKUROV (ARCHIVE & PILLARS) ================= */}
      {mode === 'merkurov' && (
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center justify-center my-auto text-center">
          <p className="font-serif italic text-zinc-600 text-base sm:text-lg md:text-xl mb-8 sm:mb-10 tracking-wide font-normal max-w-lg">
            “Structure is the antidote to chaos.”
          </p>

          <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-serif font-normal tracking-tight leading-[0.95] text-[#111111] mb-12 sm:mb-16">
            Context Architecture <br />
            <span className="text-zinc-500 italic font-serif">&amp; Cultural Capital</span>
          </h1>

          <nav className="flex flex-wrap justify-center gap-6 sm:gap-10 md:gap-14 items-center font-mono text-sm sm:text-base uppercase tracking-[0.2em] mb-16">
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

          <div>
            <button
              onClick={() => setMode('temple')}
              className="group inline-flex items-center gap-3 border border-zinc-900/20 bg-white/80 hover:bg-[#111111] text-[#111111] hover:text-[#FAF8F5] px-8 py-4 transition-all duration-300 ease-out backdrop-blur-sm shadow-sm"
            >
              <span className="font-serif text-base sm:text-lg italic font-normal tracking-wide px-1">
                Enter Digital Temple
              </span>
              <ArrowUpRight
                size={18}
                className="text-zinc-600 group-hover:text-[#FAF8F5] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300"
              />
            </button>
          </div>
        </div>
      )}

      {/* ================= MODE 2: DIGITAL TEMPLE (SANCTUARY) ================= */}
      {mode === 'temple' && (
        <div className="max-w-6xl mx-auto w-full grid grid-cols-12 gap-10 relative z-20 my-auto">
          
          {/* LEFT SIDEBAR: VERTICAL RITUAL MENU (Aligned under profile/left) */}
          <aside className="col-span-12 lg:col-span-3 flex flex-row lg:flex-col items-center lg:items-start justify-center lg:justify-start gap-4 overflow-x-auto pb-4 lg:pb-0">
            {[
              { id: 'CAST', label: 'Cast', icon: ScanFace, color: 'text-indigo-600' },
              { id: 'ASH', label: 'Ash', icon: Trash2, color: 'text-rose-600' },
              { id: 'VIGIL', label: 'Vigil', icon: Flame, color: 'text-amber-600' },
              { id: 'DEBT', label: 'Debt', icon: ReceiptText, color: 'text-emerald-600' },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <div 
                  key={item.id} 
                  className="flex flex-col items-center lg:flex-row lg:items-center gap-2 lg:gap-4 group cursor-pointer" 
                  onClick={() => setActiveView(isActive ? 'WALL' : (item.id as ServiceType))}
                >
                  <button
                    className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center backdrop-blur-2xl transition-all duration-300 relative flex-shrink-0 ${
                      isActive
                        ? 'bg-white border-2 border-zinc-900 shadow-[0_10px_30px_rgba(0,0,0,0.08)] scale-110'
                        : 'bg-white/50 border border-zinc-200 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:bg-white hover:scale-105'
                    }`}
                  >
                    <Icon size={24} className={`${item.color} stroke-[1.75]`} />
                  </button>
                  <span className="text-[11px] lg:text-xs font-mono font-medium tracking-wider text-zinc-600 uppercase">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </aside>

          {/* MAIN CONTENT AREA: WALL & RITUALS */}
          <section className="col-span-12 lg:col-span-9 space-y-8">
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
                        className="flex items-center gap-2.5 px-7 py-3 rounded-full bg-zinc-900 text-white font-medium text-sm shadow-xl hover:bg-zinc-800 active:scale-95 transition-all"
                      >
                        <span>Transmit</span>
                        <Send size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {posts.map((post) => {
                      const PostIcon = post.icon;
                      return (
                        <div key={post.id} className="p-6 rounded-3xl bg-white/50 backdrop-blur-xl border border-zinc-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.015)] space-y-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2.5">
                              <PostIcon size={16} className={post.color} />
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
                          onClick={() => publishRitualResult('CAST', 'Status assigned: UNFRAMED', 'CAST', ScanFace, 'text-indigo-500')}
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
  );
}
