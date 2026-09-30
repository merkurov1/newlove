"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ScanFace, 
  Flame, 
  Trash2, 
  ReceiptText, 
  Mic, 
  Send, 
  User, 
  Settings, 
  LogOut, 
  Sparkles, 
  ArrowLeft,
  CheckCircle2
} from 'lucide-react';

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

export default function DigitalTemple() {
  const [activeView, setActiveView] = useState<ServiceType>('WALL');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState(INITIAL_POSTS);

  // Ash ritual state
  const [ashInput, setAshInput] = useState('');
  const [isAshBurnt, setIsAshBurnt] = useState(false);

  const handleSendPost = () => {
    if (!postText.trim()) return;
    const newEntry = {
      id: Date.now(),
      type: 'WHISPER',
      author: 'You',
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
      author: 'You',
      time: 'just now',
      content: `${title}: ${text}`,
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

      {/* --- HEADER --- */}
      <header className="sticky top-0 z-50 backdrop-blur-2xl bg-white/40 border-b border-white/60 shadow-[0_4px_30px_rgba(0,0,0,0.03)] px-8 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between relative">
          
          {/* Left: Circular Avatar (Aligned with left sidebar below) */}
          <div className="relative w-16 flex justify-start">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-11 h-11 rounded-full bg-gradient-to-tr from-zinc-900 to-zinc-700 text-white font-medium text-base flex items-center justify-center shadow-md ring-2 ring-white/90 hover:scale-105 active:scale-95 transition-all duration-300"
            >
              A
            </button>

            {/* Profile Popover */}
            <AnimatePresence>
              {isProfileOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute left-0 mt-3 w-64 p-4 rounded-3xl bg-white/80 backdrop-blur-3xl border border-white/90 shadow-[0_20px_50px_rgba(0,0,0,0.1)] z-50 space-y-3"
                >
                  <div className="flex items-center gap-3 pb-3 border-b border-zinc-200/50">
                    <div className="w-10 h-10 rounded-full bg-zinc-900 text-white font-medium flex items-center justify-center text-sm shadow-inner">
                      AM
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Anton Merkurov</div>
                      <div className="text-xs text-zinc-500 font-mono">ID: #008492</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-medium text-zinc-700 hover:bg-white transition-all">
                      <User size={15} className="text-zinc-500" />
                      Profile & Archetype
                    </button>
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-medium text-zinc-700 hover:bg-white transition-all">
                      <Settings size={15} className="text-zinc-500" />
                      Settings
                    </button>
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-medium text-rose-600 hover:bg-rose-50/60 transition-all">
                      <LogOut size={15} />
                      Sign Out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Center: Grand DIGITAL TEMPLE Header & Subtitle */}
          <div className="text-center cursor-pointer group" onClick={() => setActiveView('WALL')}>
            <h1 className="text-3xl md:text-4xl font-serif tracking-[0.25em] font-light text-zinc-900 uppercase transition-all duration-300 group-hover:opacity-80">
              Digital Temple
            </h1>
            <p className="text-[11px] font-mono tracking-[0.2em] text-zinc-500 uppercase mt-1.5 font-medium">
              A Sanctuary for Attention Hygiene & Ephemeral Presence
            </p>
          </div>

          {/* Right: Balance spacer & Live status */}
          <div className="w-16 flex justify-end items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10B981]" />
            <span className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase font-medium hidden sm:inline">
              Live
            </span>
          </div>

        </div>
      </header>

      {/* --- MAIN GRID LAYOUT --- */}
      <main className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-12 gap-10 relative z-10">

        {/* ================= LEFT SIDEBAR: CIRCULAR RITUAL MENU (ALIGNED WITH AVATAR) ================= */}
        <aside className="col-span-12 lg:col-span-2 flex flex-row lg:flex-col items-start justify-start gap-7 pt-1">
          {[
            { id: 'CAST', label: 'Cast', icon: ScanFace, color: 'text-indigo-600' },
            { id: 'ASH', label: 'Ash', icon: Trash2, color: 'text-rose-600' },
            { id: 'VIGIL', label: 'Vigil', icon: Flame, color: 'text-amber-600' },
            { id: 'DEBT', label: 'Debt', icon: ReceiptText, color: 'text-emerald-600' },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <div key={item.id} className="flex flex-col items-center gap-2 group">
                <button
                  onClick={() => setActiveView(isActive ? 'WALL' : (item.id as ServiceType))}
                  className={`w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-2xl transition-all duration-300 relative ${
                    isActive
                      ? 'bg-white border-2 border-white shadow-[0_10px_30px_rgba(0,0,0,0.08)] scale-110 ring-4 ring-zinc-900/10'
                      : 'bg-white/50 border border-white/80 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:bg-white/80 hover:scale-105'
                  }`}
                >
                  <Icon size={26} className={`${item.color} stroke-[1.75]`} />
                </button>
                <span className="text-xs font-mono font-medium tracking-wider text-zinc-600 uppercase">
                  {item.label}
                </span>
              </div>
            );
          })}
        </aside>

        {/* ================= RIGHT / MAIN CONTENT: THE WALL & SERVICES ================= */}
        <section className="col-span-12 lg:col-span-10 space-y-8">
          
          <AnimatePresence mode="wait">
            
            {/* 1. THE WALL VIEW */}
            {activeView === 'WALL' && (
              <motion.div
                key="wall"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="space-y-8"
              >
                {/* INPUT CONTAINER */}
                <div className="p-7 rounded-3xl bg-white/70 backdrop-blur-2xl border border-white/90 shadow-[0_12px_40px_rgba(0,0,0,0.03)] space-y-4">
                  <textarea
                    value={postText}
                    onChange={(e) => setPostText(e.target.value)}
                    placeholder="Leave a whisper, reflection, or record..."
                    className="w-full bg-transparent text-lg text-zinc-800 placeholder-zinc-400 resize-none focus:outline-none min-h-[110px] font-normal leading-relaxed"
                  />

                  <div className="flex items-center justify-between pt-2">
                    <button className="p-3 rounded-full bg-white/80 text-zinc-600 hover:bg-white transition-all shadow-sm border border-white/90">
                      <Mic size={18} />
                    </button>

                    <button
                      onClick={handleSendPost}
                      className="flex items-center gap-2.5 px-7 py-3 rounded-full bg-zinc-900 text-white font-medium text-sm shadow-xl shadow-zinc-900/10 hover:bg-zinc-800 active:scale-95 transition-all"
                    >
                      <span>Transmit</span>
                      <Send size={14} />
                    </button>
                  </div>
                </div>

                {/* STREAM FEED */}
                <div className="space-y-4">
                  {posts.map((post) => {
                    const PostIcon = post.icon;
                    return (
                      <div
                        key={post.id}
                        className="p-6 rounded-3xl bg-white/50 backdrop-blur-xl border border-white/70 shadow-[0_4px_20px_rgba(0,0,0,0.015)] space-y-2.5 hover:bg-white/70 transition-all duration-300"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2.5">
                            <PostIcon size={16} className={post.color} />
                            <span className="font-semibold text-zinc-900 text-sm">{post.author}</span>
                          </div>
                          <span className="text-zinc-400 font-mono text-xs">{post.time}</span>
                        </div>
                        <p className="text-base text-zinc-800 leading-relaxed font-normal">
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
                transition={{ duration: 0.25 }}
                className="p-10 rounded-3xl bg-white/80 backdrop-blur-3xl border border-white/90 shadow-[0_20px_60px_rgba(0,0,0,0.05)] space-y-8"
              >
                <button
                  onClick={() => setActiveView('WALL')}
                  className="inline-flex items-center gap-2 text-xs font-mono font-medium text-zinc-500 hover:text-zinc-900 transition-colors uppercase tracking-wider"
                >
                  <ArrowLeft size={14} />
                  <span>Return to Wall</span>
                </button>

                <div className="space-y-2">
                  <h2 className="text-3xl font-serif font-light text-zinc-900">Psychometric Cast</h2>
                  <p className="text-sm text-zinc-500 leading-relaxed">A rapid diagnostic mirror of attention.</p>
                </div>

                <div className="p-8 rounded-2xl bg-white/60 border border-white/90 space-y-5">
                  <div className="text-sm font-medium text-zinc-800">What currently occupies your mental bandwidth?</div>
                  <div className="space-y-3">
                    {['Information Overload', 'Unresolved Decisions', 'External Expectations'].map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => publishRitualResult('CAST', 'Status assigned: UNFRAMED', 'CAST', ScanFace, 'text-indigo-500')}
                        className="w-full p-4 rounded-xl bg-white/90 hover:bg-white text-left text-sm font-medium text-zinc-800 transition-all border border-zinc-100 shadow-sm"
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
                transition={{ duration: 0.25 }}
                className="p-10 rounded-3xl bg-white/80 backdrop-blur-3xl border border-white/90 shadow-[0_20px_60px_rgba(0,0,0,0.05)] space-y-8"
              >
                <button
                  onClick={() => setActiveView('WALL')}
                  className="inline-flex items-center gap-2 text-xs font-mono font-medium text-zinc-500 hover:text-zinc-900 transition-colors uppercase tracking-wider"
                >
                  <ArrowLeft size={14} />
                  <span>Return to Wall</span>
                </button>

                <div className="space-y-2">
                  <h2 className="text-3xl font-serif font-light text-zinc-900">Data Incinerator</h2>
                  <p className="text-sm text-zinc-500 leading-relaxed">Write what needs to be purged. Bytes dissolve irrevocably.</p>
                </div>

                <textarea
                  value={ashInput}
                  onChange={(e) => setAshInput(e.target.value)}
                  placeholder="Record the noise..."
                  className="w-full p-5 rounded-2xl bg-white/60 border border-white/90 text-base text-zinc-800 placeholder-zinc-400 focus:outline-none min-h-[160px]"
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
                  className="w-full py-4 rounded-full bg-rose-600 text-white font-medium text-sm shadow-xl shadow-rose-600/20 hover:bg-rose-700 active:scale-98 transition-all"
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
                transition={{ duration: 0.25 }}
                className="p-10 rounded-3xl bg-white/80 backdrop-blur-3xl border border-white/90 shadow-[0_20px_60px_rgba(0,0,0,0.05)] space-y-8 text-center"
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

                <div className="py-6 space-y-5">
                  <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Flame size={36} />
                  </div>
                  <div className="text-4xl font-mono font-light text-zinc-900">23:41:09</div>
                  <p className="text-sm text-zinc-500 max-w-sm mx-auto">Sustain the collective flame of presence.</p>

                  <button
                    onClick={() => publishRitualResult('VIGIL', 'Flame extended', 'VIGIL', Flame, 'text-amber-500')}
                    className="px-9 py-3.5 rounded-full bg-amber-600 text-white font-medium text-sm shadow-xl shadow-amber-600/20 hover:bg-amber-700 active:scale-95 transition-all"
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
                transition={{ duration: 0.25 }}
                className="p-10 rounded-3xl bg-white/80 backdrop-blur-3xl border border-white/90 shadow-[0_20px_60px_rgba(0,0,0,0.05)] space-y-8 text-center"
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

                <div className="py-6 space-y-5">
                  <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <ReceiptText size={36} />
                  </div>
                  <div className="text-base font-mono text-emerald-800">BALANCE // 0.00 ZERO</div>
                  <p className="text-sm text-zinc-500 max-w-sm mx-auto">Zero-balance receipt for phantom obligations.</p>

                  <button
                    onClick={() => publishRitualResult('DEBT', 'Absolution receipt generated', 'DEBT', CheckCircle2, 'text-emerald-500')}
                    className="px-9 py-3.5 rounded-full bg-emerald-700 text-white font-medium text-sm shadow-xl shadow-emerald-700/20 hover:bg-emerald-800 active:scale-95 transition-all"
                  >
                    Generate Receipt
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>

        </section>

      </main>
    </div>
  );
}
