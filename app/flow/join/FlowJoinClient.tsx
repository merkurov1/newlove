'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ArrowRight, CheckCircle2, ShieldCheck, Globe, Sparkles } from 'lucide-react';
import Link from 'next/link';

type Language = 'ru' | 'en';

const content = {
  ru: {
    badge: 'ПРИВАТНЫЙ ПОТОК',
    title: 'THE FLOW',
    subtitle: 'Еженедельный журнал о медиа, искусстве, ИИ и цифровой культуре.',
    description:
      'Без алгоритмического шума и спама. Чистая частота наблюдений от Антона Меркурова, поступающая на ваш email только тогда, когда есть что сказать.',
    placeholder: 'ваш@email.com',
    button: 'Подписаться',
    submitting: 'Отправка...',
    successTitle: 'Спасибо! Вы во Flow',
    successText: 'Первый выпуск придет на ваш email. Проверьте почту для подтверждения.',
    anotherEmail: 'Подписать другой email',
    privacyNote: 'Без спама и трекеров. Отписка в любой момент в один клик.',
    stats: [
      { label: 'ФОРМАТ', value: 'Текст и мысли' },
      { label: 'ЧАСТОТА', value: 'Регулярно' },
      { label: 'ДОСТУП', value: 'Открытый' },
    ],
  },
  en: {
    badge: 'PRIVATE DISPATCH',
    title: 'THE FLOW',
    subtitle: 'A newsletter on media, art, AI, and digital culture.',
    description:
      'No algorithmic noise. Zero spam. A pure stream of reflections by Anton Merkurov, delivered straight to your inbox when there is something vital to share.',
    placeholder: 'you@example.com',
    button: 'Subscribe',
    submitting: 'Connecting...',
    successTitle: 'Welcome to the Flow',
    successText: 'Thank you! The next dispatch will arrive in your inbox shortly.',
    anotherEmail: 'Subscribe another email',
    privacyNote: 'Zero tracking. Instant one-click unsubscribe anytime.',
    stats: [
      { label: 'FORMAT', value: 'Pure Text' },
      { label: 'FREQUENCY', value: 'Weekly' },
      { label: 'ACCESS', value: 'Direct' },
    ],
  },
};

export default function FlowJoinClient() {
  const [lang, setLang] = useState<Language>('ru');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Авто-определение языка браузера при первом входе
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userLang = navigator.language.toLowerCase();
      if (!userLang.includes('ru')) {
        setLang('en');
      }
    }
  }, []);

  const t = content[lang];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) return;

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          language: lang,
          locale: lang,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || (lang === 'ru' ? 'Ошибка подписки' : 'Subscription failed'));
      }

      setStatus('success');
      setEmail('');
    } catch (err: any) {
      console.error('Subscription error:', err);
      setStatus('error');
      setErrorMessage(
        err.message ||
          (lang === 'ru'
            ? 'Произошла ошибка. Попробуйте позже.'
            : 'An error occurred. Please try again.')
      );
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setErrorMessage('');
  };

  return (
    <main className="min-h-screen bg-[#FAF8F5] text-stone-900 pt-28 sm:pt-36 pb-20 px-6 flex flex-col justify-between relative selection:bg-stone-900 selection:text-white font-sans">
      {/* Декоративный тонкий фон в стиле галерейного White Cube */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

      <div className="relative z-10 max-w-xl mx-auto w-full my-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white/90 backdrop-blur-2xl border border-stone-200/80 rounded-3xl p-8 sm:p-12 shadow-[0_20px_60px_rgba(0,0,0,0.03)] relative overflow-hidden"
        >
          {/* Верхняя панель карточки: Статус + Переключатель языка */}
          <div className="flex items-center justify-between gap-4 mb-8">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-stone-100 border border-stone-200/80 text-[10px] font-mono tracking-[0.18em] text-stone-600 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {t.badge}
            </span>

            {/* Переключатель Языка (RU / EN) */}
            <div className="flex items-center gap-1 bg-stone-100/90 p-1 rounded-xl border border-stone-200/60 font-mono text-xs">
              <button
                type="button"
                onClick={() => setLang('ru')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  lang === 'ru'
                    ? 'bg-stone-900 text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                RU
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  lang === 'en'
                    ? 'bg-stone-900 text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                EN
              </button>
            </div>
          </div>

          {/* Заголовок и Текст */}
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-stone-900 mb-3">
            {t.title}
          </h1>
          <p className="text-base sm:text-lg font-medium text-stone-800 mb-3 leading-snug">
            {t.subtitle}
          </p>
          <p className="text-xs sm:text-sm text-stone-500 leading-relaxed mb-8">
            {t.description}
          </p>

          {/* Интерактивная Форма */}
          <AnimatePresence mode="wait">
            {status === 'success' ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="p-6 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 text-center space-y-3"
              >
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h3 className="text-base font-bold text-stone-900">{t.successTitle}</h3>
                <p className="text-xs text-stone-600 leading-relaxed">{t.successText}</p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-2 text-xs font-mono text-stone-500 hover:text-stone-900 underline transition-colors cursor-pointer"
                >
                  {t.anotherEmail}
                </button>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={handleSubmit}
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t.placeholder}
                      className="w-full bg-stone-50/80 border border-stone-200 focus:border-stone-900 rounded-2xl py-3.5 pl-11 pr-4 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="px-6 py-3.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer shadow-sm active:scale-95"
                  >
                    {status === 'loading' ? (
                      <span>{t.submitting}</span>
                    ) : (
                      <>
                        <span>{t.button}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>

                {status === 'error' && (
                  <p className="text-xs font-mono text-rose-600 pt-1 px-1">{errorMessage}</p>
                )}

                <div className="flex items-center gap-2 pt-2 text-[11px] font-mono text-stone-400">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-stone-400" />
                  <span>{t.privacyNote}</span>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Плашка характеристик */}
          <div className="grid grid-cols-3 gap-4 pt-8 mt-8 border-t border-stone-100">
            {t.stats.map((stat, idx) => (
              <div key={idx} className="text-left">
                <div className="text-[10px] font-mono text-stone-400 uppercase tracking-widest mb-1">
                  {stat.label}
                </div>
                <div className="text-xs font-bold text-stone-800">{stat.value}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Быстрые ссылки футера */}
      <footer className="relative z-10 max-w-xl mx-auto w-full pt-10 text-center font-mono text-xs text-stone-400 flex justify-center gap-6">
        <Link href="/flow" className="hover:text-stone-900 transition-colors">
          FLOW FEED
        </Link>
        <span>•</span>
        <Link href="/art-engine" className="hover:text-stone-900 transition-colors">
          ART ENGINE
        </Link>
        <span>•</span>
        <Link href="/lobby" className="hover:text-stone-900 transition-colors">
          LOBBY
        </Link>
      </footer>
    </main>
  );
}
