"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ScanFace, 
  Trash2, 
  Flame, 
  ReceiptText, 
  Mic, 
  Send, 
  User, 
  Settings, 
  LogOut, 
  Sparkles, 
  ChevronDown,
  Volume2,
  Radio,
  Plus
} from 'lucide-react';

// Мок-данные для Ленты («Стены»)
const INITIAL_POSTS = [
  {
    id: 1,
    type: 'VIGIL',
    author: 'Anonymous #089',
    time: '2 мин назад',
    content: 'Добавил искру в общий огонь. Пусть горит еще 24 часа.',
    badgeColor: 'from-amber-500/20 to-orange-500/20 text-amber-300 border-amber-500/30',
    icon: Flame
  },
  {
    id: 2,
    type: 'WHISPER',
    author: 'Anton M.',
    time: '14 мин назад',
    content: 'Алгоритмы шумят слишком громко. Сжигаю лишние мысли в ASH.',
    badgeColor: 'from-rose-500/20 to-red-500/20 text-rose-300 border-rose-500/30',
    icon: Trash2
  },
  {
    id: 3,
    type: 'CAST',
    author: 'Visitor #402',
    time: '1 час назад',
    content: 'Пройден диагностический тест. Получен архетип: UNFRAMED.',
    badgeColor: 'from-indigo-500/20 to-purple-500/20 text-indigo-300 border-indigo-500/30',
    icon: ScanFace
  }
];

export default function DigitalTempleWall() {
  const [activeTab, setActiveTab] = useState('ALL');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState(INITIAL_POSTS);

  const handleSendPost = () => {
    if (!postText.trim()) return;
    const newEntry = {
      id: Date.now(),
      type: 'WHISPER',
      author: 'You (Anon)',
      time: 'Только что',
      content: postText,
      badgeColor: 'from-cyan-500/20 to-blue-500/20 text-cyan-300 border-cyan-500/30',
      icon: Radio
    };
    setPosts([newEntry, ...posts]);
    setPostText('');
  };

  return (
    <div className="min-h-screen bg-[#0A0B10] text-zinc-100 font-sans selection:bg-cyan-500/30 relative overflow-x-hidden">
      
      {/* --- BACKGROUND GLOWS (CYBERPUNK LIQUID AMBIENT) --- */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[160px] pointer-events-none" />

      {/* --- HEADER --- */}
      <header className="sticky top-0 z-40 bg-[#0A0B10]/60 backdrop-blur-2xl border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-serif font-black tracking-wider uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
                Digital Temple
              </h1>
              <span className="flex items-center gap-1.5 text-[10px] font-mono tracking-widest px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                SYSTEM_LIVE
              </span>
            </div>
            <p className="text-xs font-mono text-zinc-400 tracking-wide">
              A sanctuary for attention hygiene, ritualistic reset & collective presence.
            </p>
          </div>
        </div>
      </header>

      {/* --- MAIN LAYOUT (GRID) --- */}
      <main className="max-w-7xl mx-auto px-6 pt-8 pb-20 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">

        {/* ================= LEFT SIDEBAR (AVATAR & SERVICES) ================= */}
        <aside className="lg:col-span-4 space-y-6">
          
          {/* USER AVATAR & PROFILE MENU */}
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 hover:border-white/20 transition-all shadow-xl group hover:bg-white/[0.05]"
            >
              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 via-cyan-500 to-rose-500 p-[2px] shadow-lg shadow-indigo-500/20">
                    <div className="w-full h-full bg-[#0D0E15] rounded-[10px] flex items-center justify-center font-mono font-bold text-lg text-white">
                      A
                    </div>
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#0A0B10] rounded-full" />
                </div>
                <div className="text-left">
                  <div className="font-mono text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                    Anton Merkurov
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500">
                    ID: #008492 // ACTIVE
                  </div>
                </div>
              </div>
              <ChevronDown size={18} className={`text-zinc-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* PROFILE DROPDOWN */}
            <AnimatePresence>
              {isProfileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full left-0 right-0 mt-2 p-2 rounded-2xl bg-[#0D0E15]/90 backdrop-blur-2xl border border-white/10 shadow-2xl z-30 space-y-1"
                >
                  <button className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-mono text-zinc-300 hover:text-white hover:bg-white/10 transition-all">
                    <User size={14} className="text-cyan-400" />
                    <span>Профиль / Архетип</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-mono text-zinc-300 hover:text-white hover:bg-white/10 transition-all">
                    <Settings size={14} className="text-indigo-400" />
                    <span>Настройки терминала</span>
                  </button>
                  <div className="h-px bg-white/10 my-1" />
                  <button className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-mono text-rose-400 hover:bg-rose-500/10 transition-all">
                    <LogOut size={14} />
                    <span>Выйти / Сбросить сессию</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* SERVICES MENU */}
          <div className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-xl space-y-3">
            <div className="text-[10px] font-mono font-bold tracking-widest text-zinc-500 uppercase px-2">
              // SERVICES & RITUALS
            </div>

            <div className="space-y-2">
              <button className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/40 hover:bg-indigo-500/10 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 group-hover:scale-105 transition-transform">
                    <ScanFace size={18} />
                  </div>
                  <div className="text-left">
                    <div className="font-mono text-xs font-bold text-white group-hover:text-indigo-300">CAST</div>
                    <div className="text-[10px] text-zinc-500">Psychometric Mirror</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-zinc-500 group-hover:text-indigo-400">RUN →</span>
              </button>

              <button className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-rose-500/40 hover:bg-rose-500/10 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 group-hover:scale-105 transition-transform">
                    <Trash2 size={18} />
                  </div>
                  <div className="text-left">
                    <div className="font-mono text-xs font-bold text-white group-hover:text-rose-300">ASH</div>
                    <div className="text-[10px] text-zinc-500">Data Incinerator</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-zinc-500 group-hover:text-rose-400">PURGE →</span>
              </button>

              <button className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-amber-500/40 hover:bg-amber-500/10 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-105 transition-transform">
                    <Flame size={18} />
                  </div>
                  <div className="text-left">
                    <div className="font-mono text-xs font-bold text-white group-hover:text-amber-300">VIGIL</div>
                    <div className="text-[10px] text-zinc-500">Collective Flame</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-zinc-500 group-hover:text-amber-400">IGNITE →</span>
              </button>

              <button className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
                    <ReceiptText size={18} />
                  </div>
                  <div className="text-left">
                    <div className="font-mono text-xs font-bold text-white group-hover:text-emerald-300">DEBT</div>
                    <div className="text-[10px] text-zinc-500">Zero Balance Receipt</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-zinc-500 group-hover:text-emerald-400">CLEAR →</span>
              </button>
            </div>
          </div>

        </aside>

        {/* ================= CENTER COLUMN ("THE WALL") ================= */}
        <section className="lg:col-span-8 space-y-6">
          
          {/* CONTENT INPUT BOX (TEXT / VOICE) */}
          <div className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl relative overflow-hidden group focus-within:border-cyan-500/50 transition-all">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <span className="text-[10px] font-mono font-bold text-cyan-400 tracking-widest uppercase flex items-center gap-2">
                <Sparkles size={12} />
                // TRANSMIT TO THE WALL
              </span>
              <span className="text-[10px] font-mono text-zinc-500">EPHEMERAL PROTOCOL</span>
            </div>

            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder="Поделитесь мыслью, шепотом или результатом ритуала..."
              className="w-full bg-transparent pt-4 pb-2 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none min-h-[90px] font-sans"
            />

            <div className="flex items-center justify-between pt-3 border-t border-white/5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsRecording(!isRecording)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all ${
                    isRecording 
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse' 
                      : 'bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Mic size={14} />
                  <span>{isRecording ? 'Запись голоса...' : 'Голос'}</span>
                </button>
              </div>

              <button
                onClick={handleSendPost}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-mono font-bold text-xs shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <span>Опубликовать</span>
                <Send size={13} />
              </button>
            </div>
          </div>

          {/* STREAM / FEED FILTER TABS */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2 font-mono text-xs">
              {['ALL', 'WHISPERS', 'EVENTS'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    activeTab === tab
                      ? 'bg-white/10 text-cyan-300 font-bold border border-white/15'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-mono text-zinc-500">LIVE FEED</span>
          </div>

          {/* POSTS STREAM */}
          <div className="space-y-4">
            <AnimatePresence>
              {posts.map((post) => {
                const IconComponent = post.icon;
                return (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-5 rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/10 hover:border-white/20 transition-all space-y-3 relative group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border flex items-center gap-1.5 bg-gradient-to-r ${post.badgeColor}`}>
                          <IconComponent size={12} />
                          {post.type}
                        </span>
                        <span className="text-xs font-mono font-bold text-zinc-300">{post.author}</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500">{post.time}</span>
                    </div>

                    <p className="text-sm text-zinc-200 leading-relaxed font-sans">
                      {post.content}
                    </p>

                    <div className="pt-2 flex items-center justify-end gap-4 text-xs font-mono text-zinc-500">
                      <button className="hover:text-cyan-400 transition-colors flex items-center gap-1">
                        <span>Re-echo</span>
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

        </section>

      </main>
    </div>
  );
}
