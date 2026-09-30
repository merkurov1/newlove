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
    time: '2m',
    content: 'Добавил искру в общий огонь. Пламя продлено еще на 24 часа.',
    icon: Flame,
    color: 'text-amber-500'
  },
  {
    id: 2,
    type: 'ASH',
    author: 'Anton M.',
    time: '14m',
    content: 'Сожжен информационный шум. Холст очищен.',
    icon: Trash2,
    color: 'text-rose-500'
  },
  {
    id: 3,
    type: 'CAST',
    author: 'Visitor',
    time: '1h',
    content: 'Архетип проявлен: UNFRAMED.',
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
    <div className="min-h-screen bg-gradient-to-b from-[#EFEFEF] via-[#EAEAEA] to-[#E5E5E5] text-zinc-900 font-sans selection:bg-zinc-900 selection:text-white relative overflow-x-hidden antialiased">
      
      {/* Background Soft Glows (Spatial Effect) */}
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-tr from-indigo-200/40 via-purple-100/30 to-amber-100/40 blur-[120px] pointer-events-none rounded-full" />

      {/* --- HEADER --- */}
      <header className="sticky top-0 z-50 backdrop-blur-2xl bg-white/40 border-b border-white/60 shadow-[0_4px_30px_rgba(0,0,0,0.02)] px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between relative">
          
          {/* Left: Minimal Circular Avatar */}
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-10 h-10 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-600 text-white font-medium text-sm flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] ring-2 ring-white/80 hover:scale-105 active:scale-95 transition-all duration-300"
            >
              A
            </button>

            {/* Glass Profile Popover */}
            <AnimatePresence>
              {isProfileOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute left-0 mt-3 w-64 p-4 rounded-3xl bg-white/70 backdrop-blur-3xl border border-white/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] z-50 space-y-3"
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
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-medium text-zinc-700 hover:bg-white/80 transition-all">
                      <User size={15} className="text-zinc-500" />
                      Профиль & Архетип
                    </button>
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-medium text-zinc-700 hover:bg-white/80 transition-all">
                      <Settings size={15} className="text-zinc-500" />
                      Настройки
                    </button>
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-medium text-rose-600 hover:bg-rose-50/60 transition-all">
                      <LogOut size={15} />
                      Выйти
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Center: DIGITAL TEMPLE Header */}
          <div className="absolute left-1/2 -translate-x-1/2 text-center">
            <h1 className="text-xl font-serif tracking-[0.2em] font-semibold text-zinc-900 uppercase">
              Digital Temple
            </h1>
          </div>

          {/* Right: Live Status Indicator */}
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10B981]" />
            <span className="text-[11px] font-mono tracking-wider text-zinc-500 uppercase font-medium">
              Active
            </span>
          </div>

        </div>
      </header>

      {/* --- MAIN CONTAINER --- */}
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-10 relative z-10">

        {/* --- RITUAL TILES (LARGE ICON NAVIGATION) --- */}
        <section className="grid grid-cols-4 gap-4">
          {[
            { id: 'CAST', label: 'Cast', icon: ScanFace, color: 'text-indigo-600', activeBg: 'bg-indigo-500/10' },
            { id: 'ASH', label: 'Ash', icon: Trash2, color: 'text-rose-600', activeBg: 'bg-rose-500/10' },
            { id: 'VIGIL', label: 'Vigil', icon: Flame, color: 'text-amber-600', activeBg: 'bg-amber-500/10' },
            { id: 'DEBT', label: 'Debt', icon: ReceiptText, color: 'text-emerald-600', activeBg: 'bg-emerald-500/10' },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(isActive ? 'WALL' : (item.id as ServiceType))}
                className={`group flex flex-col items-center justify-center p-6 rounded-3xl transition-all duration-300 relative ${
                  isActive
                    ? 'bg-white/80 border-2 border-white shadow-[0_12px_30px_rgba(0,0,0,0.06)] scale-105'
                    : 'bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_20px_rgba(0,0,0,0.02)] hover:bg-white/70 hover:scale-[1.02]'
                }`}
              >
                <div className={`p-3 rounded-2xl mb-2 transition-transform duration-300 group-hover:scale-110 ${item.color}`}>
                  <Icon size={28} strokeWidth={1.75} />
                </div>
                <span className="text-xs font-medium tracking-wide text-zinc-700">
                  {item.label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="activeGlow"
                    className="absolute inset-0 rounded-3xl ring-2 ring-zinc-900/10 pointer-events-none"
                  />
                )}
              </button>
            );
          })}
        </section>

        {/* --- DYNAMIC ATRIUM (WALL OR FULL REPLACEMENT SERVICE) --- */}
        <AnimatePresence mode="wait">
          
          {/* ================= 1. WALL VIEW ================= */}
          {activeView === 'WALL' && (
            <motion.div
              key="wall"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {/* INPUT CONTAINER */}
              <div className="p-6 rounded-3xl bg-white/60 backdrop-blur-2xl border border-white/80 shadow-[0_10px_40px_rgba(0,0,0,0.03)] space-y-4">
                <textarea
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  placeholder="Оставьте мысль или шепот..."
                  className="w-full bg-transparent text-base text-zinc-800 placeholder-zinc-400 resize-none focus:outline-none min-h-[90px] font-normal leading-relaxed"
                />

                <div className="flex items-center justify-between pt-2">
                  <button className="p-2.5 rounded-full bg-white/60 text-zinc-600 hover:bg-white transition-all shadow-sm">
                    <Mic size={18} />
                  </button>

                  <button
                    onClick={handleSendPost}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-zinc-900 text-white font-medium text-xs shadow-lg shadow-zinc-900/10 hover:bg-zinc-800 active:scale-95 transition-all"
                  >
                    <span>Передать</span>
                    <Send size={13} />
                  </button>
                </div>
              </div>

              {/* STREAM FEED */}
              <div className="space-y-3">
                {posts.map((post) => {
                  const PostIcon = post.icon;
                  return (
                    <div
                      key={post.id}
                      className="p-5 rounded-3xl bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_4px_20px_rgba(0,0,0,0.015)] space-y-2 hover:bg-white/60 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <PostIcon size={15} className={post.color} />
                          <span className="font-semibold text-zinc-800">{post.author}</span>
                        </div>
                        <span className="text-zinc-400 font-mono text-[11px]">{post.time}</span>
                      </div>
                      <p className="text-sm text-zinc-700 leading-relaxed font-normal">
                        {post.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ================= 2. CAST SERVICE ================= */}
          {activeView === 'CAST' && (
            <motion.div
              key="cast"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="p-8 rounded-3xl bg-white/70 backdrop-blur-3xl border border-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.05)] space-y-6"
            >
              <button
                onClick={() => setActiveView('WALL')}
                className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                <ArrowLeft size={14} />
                <span>Вернуться к Стене</span>
              </button>

              <div className="space-y-2">
                <h2 className="text-2xl font-serif font-medium text-zinc-900">Psychometric Cast</h2>
                <p className="text-xs text-zinc-500 leading-relaxed">Быстрая диагностика внимания.</p>
              </div>

              <div className="p-6 rounded-2xl bg-white/50 border border-white/80 space-y-4">
                <div className="text-xs font-medium text-zinc-700">Что сейчас занимает больше всего памяти?</div>
                <div className="space-y-2">
                  {['Информационный шум', 'Непринятые решения', 'Внешние ожидания'].map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => publishRitualResult('CAST', 'Присвоен статус UNFRAMED', 'CAST', ScanFace, 'text-indigo-500')}
                      className="w-full p-3.5 rounded-xl bg-white/80 hover:bg-white text-left text-xs font-medium text-zinc-800 transition-all border border-zinc-100 shadow-sm"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ================= 3. ASH SERVICE ================= */}
          {activeView === 'ASH' && (
            <motion.div
              key="ash"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="p-8 rounded-3xl bg-white/70 backdrop-blur-3xl border border-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.05)] space-y-6"
            >
              <button
                onClick={() => setActiveView('WALL')}
                className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                <ArrowLeft size={14} />
                <span>Вернуться к Стене</span>
              </button>

              <div className="space-y-2">
                <h2 className="text-2xl font-serif font-medium text-zinc-900">Data Incinerator</h2>
                <p className="text-xs text-zinc-500 leading-relaxed">Напишите то, что необходимо стереть. Данные сгорают без следа.</p>
              </div>

              <textarea
                value={ashInput}
                onChange={(e) => setAshInput(e.target.value)}
                placeholder="Запишите шум..."
                className="w-full p-4 rounded-2xl bg-white/50 border border-white/80 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none min-h-[140px]"
              />

              <button
                onClick={() => {
                  setIsAshBurnt(true);
                  setTimeout(() => {
                    setAshInput('');
                    setIsAshBurnt(false);
                    publishRitualResult('ASH', 'Сожжен информационный шум', 'ASH', Trash2, 'text-rose-500');
                  }, 800);
                }}
                className="w-full py-3.5 rounded-full bg-rose-600 text-white font-medium text-xs shadow-lg shadow-rose-600/20 hover:bg-rose-700 active:scale-98 transition-all"
              >
                {isAshBurnt ? 'Уничтожение...' : 'Сожечь'}
              </button>
            </motion.div>
          )}

          {/* ================= 4. VIGIL SERVICE ================= */}
          {activeView === 'VIGIL' && (
            <motion.div
              key="vigil"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="p-8 rounded-3xl bg-white/70 backdrop-blur-3xl border border-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.05)] space-y-6 text-center"
            >
              <div className="text-left">
                <button
                  onClick={() => setActiveView('WALL')}
                  className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  <ArrowLeft size={14} />
                  <span>Вернуться к Стене</span>
                </button>
              </div>

              <div className="py-6 space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Flame size={32} />
                </div>
                <div className="text-3xl font-mono font-light text-zinc-900">23:41:09</div>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto">Поддержите коллективный огонь присутствия.</p>

                <button
                  onClick={() => publishRitualResult('VIGIL', 'Пламя продлено', 'VIGIL', Flame, 'text-amber-500')}
                  className="px-8 py-3 rounded-full bg-amber-600 text-white font-medium text-xs shadow-lg shadow-amber-600/20 hover:bg-amber-700 active:scale-95 transition-all"
                >
                  Подкинуть искру
                </button>
              </div>
            </motion.div>
          )}

          {/* ================= 5. DEBT SERVICE ================= */}
          {activeView === 'DEBT' && (
            <motion.div
              key="debt"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="p-8 rounded-3xl bg-white/70 backdrop-blur-3xl border border-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.05)] space-y-6 text-center"
            >
              <div className="text-left">
                <button
                  onClick={() => setActiveView('WALL')}
                  className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  <ArrowLeft size={14} />
                  <span>Вернуться к Стене</span>
                </button>
              </div>

              <div className="py-6 space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <ReceiptText size={32} />
                </div>
                <div className="text-sm font-mono text-emerald-800">BAL // 0.00 ZERO</div>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto">Обнуление фантомных обязательств.</p>

                <button
                  onClick={() => publishRitualResult('DEBT', 'Выдана квитанция обнуления', 'DEBT', CheckCircle2, 'text-emerald-500')}
                  className="px-8 py-3 rounded-full bg-emerald-700 text-white font-medium text-xs shadow-lg shadow-emerald-700/20 hover:bg-emerald-800 active:scale-95 transition-all"
                >
                  Сгенерировать квитанцию
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

      </main>
    </div>
  );
}
