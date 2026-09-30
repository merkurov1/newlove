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
  ArrowLeft,
  CheckCircle2,
  Volume2
} from 'lucide-react';

type ServiceType = 'WALL' | 'CAST' | 'ASH' | 'VIGIL' | 'DEBT';

const INITIAL_POSTS = [
  {
    id: 1,
    type: 'VIGIL',
    author: 'Anonymous #089',
    time: '2 мин назад',
    content: 'Добавил искру в общий огонь. Пламя продлено еще на 24 часа.',
    badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
    icon: Flame
  },
  {
    id: 2,
    type: 'WHISPER',
    author: 'Anton M.',
    time: '14 мин назад',
    content: 'Алгоритмы шумят слишком громко. Сжигаю лишние мысли и оставляю холст чистым.',
    badgeBg: 'bg-rose-100 text-rose-900 border-rose-300',
    icon: Trash2
  },
  {
    id: 3,
    type: 'CAST',
    author: 'Visitor #402',
    time: '1 час назад',
    content: 'Пройдена диагностика восприятия. Присвоен архетип: UNFRAMED.',
    badgeBg: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    icon: ScanFace
  }
];

export default function DigitalTempleWall() {
  const [activeView, setActiveView] = useState<ServiceType>('WALL');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [postText, setPostText] = useState('');
  const [posts, setPosts] = useState(INITIAL_POSTS);

  // Для демонстрации ритуалов внутри стены
  const [ashInput, setAshInput] = useState('');
  const [isAshBurnt, setIsAshBurnt] = useState(false);

  const handleSendPost = () => {
    if (!postText.trim()) return;
    const newEntry = {
      id: Date.now(),
      type: 'WHISPER',
      author: 'You (Anon)',
      time: 'Только что',
      content: postText,
      badgeBg: 'bg-zinc-200 text-zinc-900 border-zinc-400',
      icon: Sparkles
    };
    setPosts([newEntry, ...posts]);
    setPostText('');
  };

  const publishRitualResult = (title: string, text: string, type: string, badgeBg: string, icon: any) => {
    const newEntry = {
      id: Date.now(),
      type,
      author: 'You (Anon)',
      time: 'Только что',
      content: `${title}: ${text}`,
      badgeBg,
      icon
    };
    setPosts([newEntry, ...posts]);
    setActiveView('WALL');
  };

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#111111] font-sans selection:bg-[#111111] selection:text-white relative">
      
      {/* --- HEADER --- */}
      <header className="sticky top-0 z-40 bg-[#F7F5F0]/90 backdrop-blur-md border-b-2 border-[#111111] px-8 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-serif font-black tracking-tight text-[#111111] uppercase">
                Digital Temple
              </h1>
              <span className="flex items-center gap-2 text-xs font-mono font-bold tracking-widest px-3 py-1 rounded-full bg-[#111111] text-white">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                SYSTEM_LIVE
              </span>
            </div>
            <p className="text-sm font-medium text-zinc-600">
              A sanctuary for attention hygiene, ritualistic reset & collective presence.
            </p>
          </div>
        </div>
      </header>

      {/* --- MAIN CONTENT (2 COLUMNS LAYOUT) --- */}
      <main className="max-w-7xl mx-auto px-8 pt-8 pb-24 grid grid-cols-1 lg:grid-cols-12 gap-10">

        {/* ================= LEFT SIDEBAR (NAVIGATION & USER) ================= */}
        <aside className="lg:col-span-4 space-y-8">
          
          {/* USER AVATAR & DROPDOWN */}
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-full flex items-center justify-between p-5 rounded-2xl bg-white border-2 border-[#111111] shadow-[4px_4px_0px_#111111] hover:shadow-[6px_6px_0px_#111111] transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-[#111111] text-white font-mono font-bold text-2xl flex items-center justify-center shadow-md">
                  A
                </div>
                <div className="text-left">
                  <div className="text-lg font-bold text-[#111111] group-hover:text-indigo-600 transition-colors">
                    Anton Merkurov
                  </div>
                  <div className="text-xs font-mono font-bold text-zinc-500">
                    ID: #008492 // ACTIVE
                  </div>
                </div>
              </div>
              <ChevronDown size={22} className={`text-[#111111] transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* DROPDOWN MENU */}
            <AnimatePresence>
              {isProfileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute top-full left-0 right-0 mt-3 p-3 rounded-2xl bg-white border-2 border-[#111111] shadow-[8px_8px_0px_#111111] z-50 space-y-1"
                >
                  <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-[#111111] hover:bg-zinc-100 transition-all">
                    <User size={18} className="text-indigo-600" />
                    <span>Профиль / Архетип</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-[#111111] hover:bg-zinc-100 transition-all">
                    <Settings size={18} className="text-zinc-600" />
                    <span>Настройки профиля</span>
                  </button>
                  <div className="h-0.5 bg-zinc-200 my-1" />
                  <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-50 transition-all">
                    <LogOut size={18} />
                    <span>Выйти</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* SERVICES MENU */}
          <div className="p-6 rounded-2xl bg-white border-2 border-[#111111] shadow-[4px_4px_0px_#111111] space-y-4">
            <div className="flex items-center justify-between border-b-2 border-zinc-100 pb-3">
              <span className="text-xs font-mono font-bold tracking-widest text-zinc-500 uppercase">
                // SERVICES & RITUALS
              </span>
              {activeView !== 'WALL' && (
                <button
                  onClick={() => setActiveView('WALL')}
                  className="text-xs font-mono font-bold text-indigo-600 hover:underline"
                >
                  К СТЕНЕ →
                </button>
              )}
            </div>

            <div className="space-y-3">
              
              {/* CAST */}
              <button
                onClick={() => setActiveView('CAST')}
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all group ${
                  activeView === 'CAST'
                    ? 'bg-indigo-50 border-indigo-600 shadow-[3px_3px_0px_#4F46E5]'
                    : 'bg-white border-[#111111] hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-indigo-100 border border-indigo-300 text-indigo-700">
                    <ScanFace size={22} />
                  </div>
                  <div className="text-left">
                    <div className="text-base font-bold text-[#111111]">CAST</div>
                    <div className="text-xs font-medium text-zinc-500">Psychometric Mirror</div>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-indigo-600">RUN →</span>
              </button>

              {/* ASH */}
              <button
                onClick={() => setActiveView('ASH')}
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all group ${
                  activeView === 'ASH'
                    ? 'bg-rose-50 border-rose-600 shadow-[3px_3px_0px_#E11D48]'
                    : 'bg-white border-[#111111] hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-rose-100 border border-rose-300 text-rose-700">
                    <Trash2 size={22} />
                  </div>
                  <div className="text-left">
                    <div className="text-base font-bold text-[#111111]">ASH</div>
                    <div className="text-xs font-medium text-zinc-500">Data Incinerator</div>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-rose-600">PURGE →</span>
              </button>

              {/* VIGIL */}
              <button
                onClick={() => setActiveView('VIGIL')}
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all group ${
                  activeView === 'VIGIL'
                    ? 'bg-amber-50 border-amber-600 shadow-[3px_3px_0px_#D97706]'
                    : 'bg-white border-[#111111] hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-700">
                    <Flame size={22} />
                  </div>
                  <div className="text-left">
                    <div className="text-base font-bold text-[#111111]">VIGIL</div>
                    <div className="text-xs font-medium text-zinc-500">Collective Flame</div>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-amber-700">IGNITE →</span>
              </button>

              {/* DEBT */}
              <button
                onClick={() => setActiveView('DEBT')}
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all group ${
                  activeView === 'DEBT'
                    ? 'bg-emerald-50 border-emerald-600 shadow-[3px_3px_0px_#059669]'
                    : 'bg-white border-[#111111] hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-700">
                    <ReceiptText size={22} />
                  </div>
                  <div className="text-left">
                    <div className="text-base font-bold text-[#111111]">DEBT</div>
                    <div className="text-xs font-medium text-zinc-500">Zero Balance Receipt</div>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-700">CLEAR →</span>
              </button>

            </div>
          </div>

        </aside>

        {/* ================= CENTER COLUMN (DYNAMIC ATRIUM: WALL OR SERVICE) ================= */}
        <section className="lg:col-span-8">
          
          <AnimatePresence mode="wait">
            
            {/* ---------------- 1. MAIN WALL VIEW ---------------- */}
            {activeView === 'WALL' && (
              <motion.div
                key="wall"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* INPUT BOX */}
                <div className="p-6 rounded-2xl bg-white border-2 border-[#111111] shadow-[6px_6px_0px_#111111] space-y-4">
                  <div className="flex items-center justify-between border-b-2 border-zinc-100 pb-3">
                    <span className="text-xs font-mono font-bold text-indigo-600 tracking-widest uppercase flex items-center gap-2">
                      <Sparkles size={16} />
                      // TRANSMIT TO THE WALL
                    </span>
                    <span className="text-xs font-mono font-bold text-zinc-400">EPHEMERAL PROTOCOL</span>
                  </div>

                  <textarea
                    value={postText}
                    onChange={(e) => setPostText(e.target.value)}
                    placeholder="Поделитесь мыслью, шепотом или результатом ритуала..."
                    className="w-full bg-transparent text-lg text-[#111111] placeholder-zinc-400 resize-none focus:outline-none min-h-[110px] font-sans leading-relaxed"
                  />

                  <div className="flex items-center justify-between pt-4 border-t-2 border-zinc-100">
                    <button
                      onClick={() => setIsRecording(!isRecording)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-mono text-xs font-bold transition-all ${
                        isRecording 
                          ? 'bg-rose-500 text-white border-[#111111] animate-pulse' 
                          : 'bg-zinc-100 text-[#111111] border-[#111111] hover:bg-zinc-200'
                      }`}
                    >
                      <Mic size={16} />
                      <span>{isRecording ? 'Идет запись...' : 'Голосовая запись'}</span>
                    </button>

                    <button
                      onClick={handleSendPost}
                      className="flex items-center gap-2 px-7 py-3 rounded-xl bg-[#111111] text-white font-mono font-bold text-sm shadow-[3px_3px_0px_#4F46E5] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[0px] active:translate-y-[0px] transition-all"
                    >
                      <span>Опубликовать</span>
                      <Send size={15} />
                    </button>
                  </div>
                </div>

                {/* FEED TABS */}
                <div className="flex items-center justify-between border-b-2 border-[#111111] pb-3">
                  <div className="flex items-center gap-3 font-mono text-xs font-bold">
                    {['ALL', 'WHISPERS', 'EVENTS'].map((tab) => (
                      <button
                        key={tab}
                        className="px-4 py-2 rounded-xl bg-white border-2 border-[#111111] shadow-[2px_2px_0px_#111111] hover:bg-zinc-100 transition-all"
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs font-mono font-bold text-zinc-500">LIVE FEED</span>
                </div>

                {/* STREAM POSTS */}
                <div className="space-y-5">
                  {posts.map((post) => {
                    const IconComponent = post.icon;
                    return (
                      <div
                        key={post.id}
                        className="p-6 rounded-2xl bg-white border-2 border-[#111111] shadow-[4px_4px_0px_#111111] space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold border-2 flex items-center gap-1.5 ${post.badgeBg}`}>
                              <IconComponent size={14} />
                              {post.type}
                            </span>
                            <span className="text-sm font-bold text-[#111111]">{post.author}</span>
                          </div>
                          <span className="text-xs font-mono font-bold text-zinc-400">{post.time}</span>
                        </div>

                        <p className="text-lg text-[#111111] leading-relaxed font-sans font-medium">
                          {post.content}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ---------------- 2. CAST RITUAL SERVICE ---------------- */}
            {activeView === 'CAST' && (
              <motion.div
                key="cast"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="p-8 rounded-2xl bg-white border-2 border-[#111111] shadow-[8px_8px_0px_#6366F1] space-y-8"
              >
                <div className="flex items-center justify-between border-b-2 border-zinc-100 pb-4">
                  <button
                    onClick={() => setActiveView('WALL')}
                    className="flex items-center gap-2 font-mono text-xs font-bold text-[#111111] hover:text-indigo-600 transition-colors"
                  >
                    <ArrowLeft size={16} />
                    <span>ВЕРНУТЬСЯ К СТЕНЕ</span>
                  </button>
                  <span className="font-mono text-xs font-bold text-indigo-600">RITUAL // CAST</span>
                </div>

                <div className="space-y-4">
                  <h2 className="text-4xl font-serif font-black text-[#111111] uppercase">
                    FACE THE MIRROR
                  </h2>
                  <p className="text-lg text-zinc-700 leading-relaxed">
                    Быстрый психометрический срез. Ответьте на 3 реакции, чтобы проявить ваш текущий цифровой архетип.
                  </p>
                </div>

                <div className="p-8 rounded-xl bg-indigo-50 border-2 border-indigo-200 space-y-6">
                  <div className="text-sm font-mono font-bold text-indigo-900 uppercase">
                    Вопрос 1 из 3: Какой ваш главный источник шума?
                  </div>
                  <div className="grid grid-cols-1 gap-3 font-medium">
                    {['Бесконечные уведомления', 'Чужие ожидания', 'Внутренний монолог'].map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => publishRitualResult('CAST ARCHETYPE', 'Получен статус UNFRAMED. Чистое восприятие.', 'CAST', 'bg-indigo-100 text-indigo-900 border-indigo-300', ScanFace)}
                        className="p-4 rounded-xl bg-white border-2 border-indigo-300 text-left hover:border-indigo-600 hover:bg-indigo-100/50 transition-all text-base font-bold text-[#111111]"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ---------------- 3. ASH RITUAL SERVICE ---------------- */}
            {activeView === 'ASH' && (
              <motion.div
                key="ash"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="p-8 rounded-2xl bg-white border-2 border-[#111111] shadow-[8px_8px_0px_#E11D48] space-y-8"
              >
                <div className="flex items-center justify-between border-b-2 border-zinc-100 pb-4">
                  <button
                    onClick={() => setActiveView('WALL')}
                    className="flex items-center gap-2 font-mono text-xs font-bold text-[#111111] hover:text-rose-600 transition-colors"
                  >
                    <ArrowLeft size={16} />
                    <span>ВЕРНУТЬСЯ К СТЕНЕ</span>
                  </button>
                  <span className="font-mono text-xs font-bold text-rose-600">RITUAL // ASH</span>
                </div>

                <div className="space-y-4">
                  <h2 className="text-4xl font-serif font-black text-[#111111] uppercase">
                    INCINERATE DATA
                  </h2>
                  <p className="text-lg text-zinc-700 leading-relaxed">
                    Напишите то, что тяготит или отвлекает. Нажмите кнопку — текст сгорит прямо на экране в нулевые байты. Ничего не сохранится в БД.
                  </p>
                </div>

                <div className="space-y-4">
                  <textarea
                    value={ashInput}
                    onChange={(e) => setAshInput(e.target.value)}
                    placeholder="Напишите мысль для сожжения..."
                    className="w-full p-5 rounded-xl bg-rose-50/50 border-2 border-rose-200 text-lg text-[#111111] placeholder-zinc-400 focus:outline-none min-h-[160px]"
                  />

                  <button
                    onClick={() => {
                      setIsAshBurnt(true);
                      setTimeout(() => {
                        setAshInput('');
                        setIsAshBurnt(false);
                        publishRitualResult('ASH PURGE', 'Сожжено 240 символов шума. Данные уничтожены.', 'ASH', 'bg-rose-100 text-rose-900 border-rose-300', Trash2);
                      }, 1200);
                    }}
                    className="w-full py-4 rounded-xl bg-rose-600 text-white font-mono font-bold text-base shadow-[4px_4px_0px_#111111] hover:bg-rose-700 transition-all flex items-center justify-center gap-3"
                  >
                    <Trash2 size={20} />
                    <span>{isAshBurnt ? 'УНИЧТОЖЕНИЕ ДАННЫХ...' : 'СОЖЕЧЬ БЕЗВОЗВРАТНО'}</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* ---------------- 4. VIGIL RITUAL SERVICE ---------------- */}
            {activeView === 'VIGIL' && (
              <motion.div
                key="vigil"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="p-8 rounded-2xl bg-white border-2 border-[#111111] shadow-[8px_8px_0px_#D97706] space-y-8"
              >
                <div className="flex items-center justify-between border-b-2 border-zinc-100 pb-4">
                  <button
                    onClick={() => setActiveView('WALL')}
                    className="flex items-center gap-2 font-mono text-xs font-bold text-[#111111] hover:text-amber-600 transition-colors"
                  >
                    <ArrowLeft size={16} />
                    <span>ВЕРНУТЬСЯ К СТЕНЕ</span>
                  </button>
                  <span className="font-mono text-xs font-bold text-amber-600">RITUAL // VIGIL</span>
                </div>

                <div className="space-y-4">
                  <h2 className="text-4xl font-serif font-black text-[#111111] uppercase">
                    KEEP THE BEACON
                  </h2>
                  <p className="text-lg text-zinc-700 leading-relaxed">
                    Общий 24-часовой огонь коллективного присутствия. Зажгите спичку, чтобы подкинуть искру и продлить горение для всех.
                  </p>
                </div>

                <div className="p-8 rounded-xl bg-amber-50 border-2 border-amber-200 text-center space-y-6">
                  <div className="w-20 h-20 mx-auto rounded-full bg-amber-500 text-white flex items-center justify-center shadow-lg animate-pulse">
                    <Flame size={40} />
                  </div>
                  <div>
                    <div className="text-3xl font-mono font-black text-[#111111]">23:41:09</div>
                    <div className="text-xs font-mono text-amber-800 font-bold uppercase mt-1">Осталось времени горения</div>
                  </div>

                  <button
                    onClick={() => publishRitualResult('VIGIL FLAME', 'Добавлена искра в общий маяк присутствия.', 'VIGIL', 'bg-amber-100 text-amber-900 border-amber-300', Flame)}
                    className="px-8 py-4 rounded-xl bg-amber-600 text-white font-mono font-bold text-base shadow-[4px_4px_0px_#111111] hover:bg-amber-700 transition-all inline-flex items-center gap-3"
                  >
                    <Flame size={20} />
                    <span>ЗАЖЕЧЬ СПИЧКУ</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* ---------------- 5. DEBT RITUAL SERVICE ---------------- */}
            {activeView === 'DEBT' && (
              <motion.div
                key="debt"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="p-8 rounded-2xl bg-white border-2 border-[#111111] shadow-[8px_8px_0px_#059669] space-y-8"
              >
                <div className="flex items-center justify-between border-b-2 border-zinc-100 pb-4">
                  <button
                    onClick={() => setActiveView('WALL')}
                    className="flex items-center gap-2 font-mono text-xs font-bold text-[#111111] hover:text-emerald-600 transition-colors"
                  >
                    <ArrowLeft size={16} />
                    <span>ВЕРНУТЬСЯ К СТЕНЕ</span>
                  </button>
                  <span className="font-mono text-xs font-bold text-emerald-600">RITUAL // DEBT</span>
                </div>

                <div className="space-y-4">
                  <h2 className="text-4xl font-serif font-black text-[#111111] uppercase">
                    ABSOLUTION RECEIPT
                  </h2>
                  <p className="text-lg text-zinc-700 leading-relaxed">
                    Закройте фантомные долги и обязательства перед собой или другими. Сгенерируйте официально заверенную квитанцию обнуления.
                  </p>
                </div>

                <div className="p-8 rounded-xl bg-emerald-50 border-2 border-emerald-200 text-center space-y-6">
                  <ReceiptText size={48} className="mx-auto text-emerald-700" />
                  <div className="text-xl font-mono font-bold text-emerald-900">
                    ТЕКУЩИЙ БАЛАНС: 0.00 ZERO
                  </div>

                  <button
                    onClick={() => publishRitualResult('DEBT ABSOLUTION', 'Выдана квитанция полного обнуления обязательств.', 'DEBT', 'bg-emerald-100 text-emerald-900 border-emerald-300', ReceiptText)}
                    className="px-8 py-4 rounded-xl bg-emerald-700 text-white font-mono font-bold text-base shadow-[4px_4px_0px_#111111] hover:bg-emerald-800 transition-all inline-flex items-center gap-3"
                  >
                    <CheckCircle2 size={20} />
                    <span>СГЕНЕРИРОВАТЬ КВИТАНЦИЮ</span>
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
