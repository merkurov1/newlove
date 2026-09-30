"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Flame, 
  Trash2, 
  ScanFace, 
  ReceiptText, 
  ArrowUpRight,
  Sparkles,
  Info,
  X
} from 'lucide-react';

interface Ritual {
  id: string;
  num: string;
  title: string;
  subtitle: string;
  path: string;
  icon: React.ReactNode;
  concept: string;
  purpose: string;
  outcome: string;
  accentBorder: string;
  badgeText?: string;
}

const RITUALS: Ritual[] = [
  {
    id: 'cast',
    num: '01',
    title: 'CAST',
    subtitle: 'ПСИХОМЕТРИЧЕСКИЙ АРХЕТИП',
    path: '/cast?mode=temple',
    icon: <ScanFace className="w-5 h-5 text-zinc-900" />,
    concept: 'Короткий алгоритм самоопределения через скрытые реакции.',
    purpose: 'Определить вектор своего состояния: Stone, Void, Noise или Unframed.',
    outcome: 'Персональный профиль и визуальная карточка с результатом.',
    accentBorder: 'group-hover:border-purple-500/40',
    badgeText: 'Диагностика'
  },
  {
    id: 'ash',
    num: '02',
    title: 'ASH',
    subtitle: 'УНИЧТОЖЕНИЕ ШУМА',
    path: '/heartandangel/letitgo?mode=temple',
    icon: <Trash2 className="w-5 h-5 text-zinc-900" />,
    concept: 'Инструмент моментальной выгрузки навязчивых мыслей и тревоги.',
    purpose: 'Записать то, что отвлекает прямо сейчас, и сжечь прямо на экране.',
    outcome: 'Текст уничтожается. В базе данных ничего не сохраняется.',
    accentBorder: 'group-hover:border-red-500/40',
    badgeText: 'Очищение'
  },
  {
    id: 'vigil',
    num: '03',
    title: 'VIGIL',
    subtitle: 'ДЕЖУРСТВО И ПРИСУТСТВИЕ',
    path: '/vigil?mode=temple',
    icon: <Flame className="w-5 h-5 text-zinc-900" />,
    concept: 'Коллективный таймер поддержания общего цифрового огня.',
    purpose: 'Пламя угасает за 24 часа. Каждый клик продлевает жизнь искры для всех.',
    outcome: 'Синхронизация присутствия и свидетельство живого пространства.',
    accentBorder: 'group-hover:border-amber-500/40',
    badgeText: 'Присутствие'
  },
  {
    id: 'absolution',
    num: '04',
    title: 'DEBT',
    subtitle: 'ЗАКРЫТИЕ ДОЛГА',
    path: '/absolution?mode=temple',
    icon: <ReceiptText className="w-5 h-5 text-zinc-900" />,
    concept: 'Формализация обнуления моральных и контекстных обязательств.',
    purpose: 'Зафиксировать закрытие гештальта или мысленного долга.',
    outcome: 'Официальная цифровая квитанция о полном погашении.',
    accentBorder: 'group-hover:border-zinc-500/40',
    badgeText: 'Реестр'
  }
];

export default function TemplePage() {
  const router = useRouter();
  const [showManifest, setShowManifest] = useState(false);

  // --- TELEGRAM WEBAPP INIT ---
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      try {
        tg.setHeaderColor('#FBFBF9');
        tg.setBackgroundColor('#FBFBF9');
        if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
      } catch (e) {}
    }
  }, []);

  const handleNavigate = (path: string) => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    router.push(path);
  };

  return (
    <div className="min-h-screen bg-[#FBFBF9] text-zinc-900 font-sans selection:bg-zinc-900 selection:text-white pb-20">
      
      {/* FORCE LIGHT NAVIGATION & OVERRIDES */}
      <style jsx global>{`
        header, footer { display: none !important; }
        body { background-color: #FBFBF9; }
      `}</style>

      {/* --- TOP BAR / HEADER --- */}
      <header className="sticky top-0 z-30 bg-[#FBFBF9]/90 backdrop-blur-md border-b border-zinc-200/80 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="font-serif text-lg font-bold tracking-widest text-zinc-900">
              TEMPLE
            </h1>
            <span className="text-[10px] font-mono uppercase text-zinc-400 tracking-wider hidden sm:inline">
              / digital hygiene
            </span>
          </div>

          <button
            onClick={() => setShowManifest(!showManifest)}
            className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-900 transition-colors px-3 py-1.5 rounded-full border border-zinc-200 hover:border-zinc-400 bg-white/50"
          >
            <Info size={14} />
            <span>Манифест</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-8 space-y-10">

        {/* --- ONBOARDING / HERO BLOCK --- */}
        <section className="bg-white border border-zinc-200 rounded-xl p-6 md:p-8 shadow-sm space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
            <Sparkles className="w-32 h-32 text-zinc-900" />
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">
              Пространство присутствия и сброса шума
            </div>
            <h2 className="text-xl md:text-2xl font-serif font-medium text-zinc-900 leading-snug">
              Инструменты гигиены внимания в цифровой среде.
            </h2>
          </div>

          <p className="text-xs md:text-sm text-zinc-600 leading-relaxed font-sans max-w-2xl">
            Современный интернет переполнен бесконечным потоком уведомлений и алгоритмическим шумом. 
            <strong className="text-zinc-900 font-semibold"> Temple</strong> — это реестр практик для восстановления паузы: 
            сжечь навязчивую мысль, сфокусировать архетип, поддержать огонь присутствия или зафиксировать обнуление.
          </p>

          <div className="pt-2 flex flex-wrap gap-4 text-[11px] font-mono text-zinc-500 border-t border-zinc-100">
            <div><span className="text-zinc-900 font-bold">4</span> Ритуала</div>
            <div>•</div>
            <div><span className="text-zinc-900 font-bold">0</span> Трекеров</div>
            <div>•</div>
            <div><span className="text-zinc-900 font-bold">100%</span> Без сохранения логов</div>
          </div>
        </section>

        {/* --- MANIFEST COLLAPSIBLE MODAL / OVERLAY --- */}
        <AnimatePresence>
          {showManifest && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-zinc-900 text-zinc-100 rounded-xl p-6 md:p-8 relative space-y-4 shadow-xl">
                <button 
                  onClick={() => setShowManifest(false)}
                  className="absolute top-4 right-4 text-zinc-400 hover:text-white p-2"
                >
                  <X size={18} />
                </button>
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                  ПРАВИЛА И ЭТИКА ПРОСТРАНСТВА
                </div>
                <h3 className="font-serif text-lg text-white">Зачем создан Temple?</h3>
                <div className="grid md:grid-cols-2 gap-4 text-xs text-zinc-300 font-sans leading-relaxed">
                  <div>
                    <strong className="text-white block mb-1">1. Без алгоритмической затягиваемости</strong>
                    Здесь нет бесконечных лент, реакций, лайков или попыток удержать ваше внимание лишнюю секунду. Все действия завершены по своей природе.
                  </div>
                  <div>
                    <strong className="text-white block mb-1">2. Абсолютная приватность</strong>
                    Ввод контента в ASH уничтожается на клиенте. В VIGIL фиксируется только факт активности. Вы ничего не оставляете следящим системам.
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- RITUALS REGISTRY GRID --- */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
            <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
              Реестр ритуалов
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">
              Выберите практику
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {RITUALS.map((ritual) => (
              <motion.div
                key={ritual.id}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.2 }}
                onClick={() => handleNavigate(ritual.path)}
                className={`
                  group cursor-pointer bg-white border border-zinc-200 rounded-xl p-6 
                  flex flex-col justify-between space-y-6 transition-all duration-200
                  hover:shadow-md hover:border-zinc-300 ${ritual.accentBorder}
                `}
              >
                {/* CARD HEADER */}
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-zinc-50 border border-zinc-200/80 flex items-center justify-center group-hover:bg-zinc-100 transition-colors">
                        {ritual.icon}
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-zinc-400 font-bold block">
                          [{ritual.num}]
                        </span>
                        <h4 className="font-serif text-lg font-bold tracking-wider text-zinc-900 group-hover:text-black">
                          {ritual.title}
                        </h4>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200/60">
                      {ritual.badgeText}
                    </span>
                  </div>

                  <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                    {ritual.subtitle}
                  </div>
                </div>

                {/* BREAKDOWN (WHAT / WHY / RESULT) */}
                <div className="space-y-2 text-xs border-t border-zinc-100 pt-4 font-sans">
                  <div className="grid grid-cols-[60px_1fr] gap-2">
                    <span className="font-mono text-[10px] uppercase text-zinc-400">Суть</span>
                    <span className="text-zinc-700 leading-snug">{ritual.concept}</span>
                  </div>
                  <div className="grid grid-cols-[60px_1fr] gap-2">
                    <span className="font-mono text-[10px] uppercase text-zinc-400">Зачем</span>
                    <span className="text-zinc-700 leading-snug">{ritual.purpose}</span>
                  </div>
                  <div className="grid grid-cols-[60px_1fr] gap-2">
                    <span className="font-mono text-[10px] uppercase text-zinc-400">Итог</span>
                    <span className="text-zinc-900 font-medium leading-snug">{ritual.outcome}</span>
                  </div>
                </div>

                {/* CARD ACTION FOOTER */}
                <div className="pt-2 flex items-center justify-between text-xs font-mono font-semibold text-zinc-900 group-hover:text-black">
                  <span>ЗАПУСТИТЬ РИТУАЛ</span>
                  <div className="w-7 h-7 rounded-full bg-zinc-100 group-hover:bg-zinc-900 group-hover:text-white flex items-center justify-center transition-all">
                    <ArrowUpRight size={14} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
