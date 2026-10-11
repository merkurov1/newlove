'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ArrowRight, CheckCircle2, ShieldCheck, Sparkles, Globe } from 'lucide-react';
import Link from 'next/link';

type Language = 'en' | 'ru';

const content = {
  en: {
    badge: 'PRIVATE DISPATCH',
    title: 'THE FLOW',
    subtitle: 'Direct, unfiltered thoughts on digital media, art, AI, and culture.',
    description:
      'No algorithmic noise. No spam. A pure frequency of reflections delivered straight to your inbox when there is something vital to say.',
    placeholder: 'Enter your email address...',
    button: 'Join the Flow',
    submitting: 'Connecting...',
    successTitle: 'Welcome to the Flow',
    successText: 'A confirmation link has been dispatched to your email.',
    privacyNote: 'Zero tracking. Instant one-click unsubscribe anytime.',
    stats: [
      { label: 'Frequency', value: 'Irregular' },
      { label: 'Format', value: 'Unfiltered Text' },
      { label: 'Signal', value: 'High' },
    ],
  },
  ru: {
    badge: 'ПРИВАТНАЯ РАССЫЛКА',
    title: 'FLOW',
    subtitle: 'Прямой поток мыслей о медиа, искусстве, ИИ и цифровой культуре.',
    description:
      'Без алгоритмического шума и спама. Чистая частота наблюдений, поступающая на ваш email только тогда, когда действительно есть что сказать.',
    placeholder: 'Введите ваш email...',
    button: 'Присоединиться',
    submitting: 'Подключение...',
    successTitle: 'Добро пожаловать во Flow',
    successText: 'Ссылка для подтверждения отправлена на ваш email.',
    privacyNote: 'Без трекинга. Отписка в один клик в любой момент.',
    stats: [
      { label: 'Частота', value: 'По мере сути' },
      { label: 'Формат', value: 'Чистый текст' },
      { label: 'Сигнал', value: 'Максимальный' },
    ],
  },
};

export default function FlowJoinClient() {
  const [lang, setLang] = useState<Language>('en');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Определяем язык браузера при загрузке
  useEffect(() => {
    const userLang = navigator.language.toLowerCase();
    if (userLang.includes('ru')) {
      setLang('ru');
    }
  }, []);

  const t = content[lang];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;

    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await fetch('/api/flow/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          locale: lang, // <--- Важно: сохраняем выбранный язык
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to subscribe');
      }

      setStatus('success');
      setEmail('');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Something went wrong. Please try again.');
    }
  };

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-stone-100 flex flex-col justify-between relative overflow-hidden font-sans selection:bg-stone-100 selection:text-black">
      {/* Декоративный фоновый градиент и сетка */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,_rgba(255,255,255,0.05)_0%,_transparent_70%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Шапка с переключателем языка */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-8 flex justify-between items-center">
        <Link
          href="/"
          className="font-bold text-sm tracking-[0.3em] uppercase text-stone-400 hover:text-white transition-colors"
        >
          ANTON MERKUROV
        </Link>

        <button
          onClick={() => setLang(lang === 'en' ? 'ru' : 'en')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-stone-800 bg-stone-900/60 hover:bg-stone-800 text-xs font-mono tracking-wider transition-all text-stone-300 hover:text-white"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>{lang.toUpperCase()}</span>
        </button>
      </header>

      {/* Центральный блок карточки */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="bg-stone-900/40 backdrop-blur-2xl border border-stone-800/80 rounded-3xl p-8 sm:p-12 shadow-[0_30px_100px_rgba(0,0,0,0.8)] relative"
          >
            {/* Статус-бейдж */}
            <div className="flex items-center gap-3 mb-8">
              <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-stone-800/80 border border-stone-700/50 text-[10px] font-mono tracking-[0.2em] text-stone-300 uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {t.badge}
              </span>
            </div>

            {/* Заголовок и подзаголовок */}
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white mb-4">
              {t.title}
            </h1>
            <p className="text-lg sm:text-xl font-medium text-stone-200 mb-4 leading-snug">
              {t.subtitle}
            </p>
            <p className="text-sm sm:text-base text-stone-400 leading-relaxed mb-8">
              {t.description}
            </p>

            {/* Форма подписки */}
            <AnimatePresence mode="wait">
              {status === 'success' ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-6 rounded-2xl bg-emerald-950/30 border border-emerald-800/50 text-center space-y-2"
                >
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <h3 className="text-lg font-bold text-emerald-200">{t.successTitle}</h3>
                  <p className="text-xs text-emerald-300/80 font-mono">{t.successText}</p>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  onSubmit={handleSubmit}
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="relative flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t.placeholder}
                        className="w-full bg-stone-950/80 border border-stone-800 focus:border-stone-400 rounded-2xl py-4 pl-12 pr-4 text-sm text-white placeholder:text-stone-600 focus:outline-none transition-all shadow-inner"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={status === 'loading'}
                      className="px-8 py-4 rounded-2xl bg-white text-black hover:bg-stone-200 font-bold text-xs uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer shadow-lg active:scale-95"
                    >
                      {status === 'loading' ? (
                        <span>{t.submitting}</span>
                      ) : (
                        <>
                          <span>{t.button}</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>

                  {status === 'error' && (
                    <p className="text-xs font-mono text-rose-400 px-2">{errorMessage}</p>
                  )}

                  <div className="flex items-center gap-2 pt-2 text-[11px] font-mono text-stone-500">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-stone-400" />
                    <span>{t.privacyNote}</span>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Метрики / Гарантия качества */}
            <div className="grid grid-cols-3 gap-4 pt-8 mt-8 border-t border-stone-800/60">
              {t.stats.map((stat, idx) => (
                <div key={idx} className="text-left">
                  <div className="text-[10px] font-mono text-stone-500 uppercase tracking-wider mb-1">
                    {stat.label}
                  </div>
                  <div className="text-xs sm:text-sm font-semibold text-stone-300">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Футер */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-mono text-stone-600">
        <div>© {new Date().getFullYear()} ANTON MERKUROV</div>
        <div className="flex gap-6">
          <Link href="/flow" className="hover:text-stone-400 transition-colors">
            FLOW FEED
          </Link>
          <Link href="/art-engine" className="hover:text-stone-400 transition-colors">
            ART ENGINE
          </Link>
          <Link href="/lobby" className="hover:text-stone-400 transition-colors">
            LOBBY
          </Link>
        </div>
      </footer>
    </main>
  );
}
