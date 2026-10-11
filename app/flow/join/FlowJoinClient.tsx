'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

type Language = 'ru' | 'en';

const PREVIEW_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/artifacts/IMG_1542.jpeg';

const content = {
  ru: {
    title: 'FLOW',
    subtitle: 'Я ничего не пишу, я только отбираю.',
    body: 'Ссылка, видео, фото, строчка: десять секунд, и запись в ленте. Остальное делает система: сортирует, считает, верстает. Раз в неделю из этого собирается выпуск без редакции, только вкус одного человека, умноженный на код.',
    footerNote: 'Если интересно, чем это кончится, оставьте адрес.',
    placeholder: 'ваш@email.com',
    button: 'Подписаться',
    submitting: 'Подключение...',
    successTitle: 'Спасибо! Вы во Flow',
    successText:
      'Первый выпуск придет на ваш email. Проверьте почту для подтверждения.',
    anotherEmail: 'Указать другой email',
    privacy: 'Без спама и трекеров. Отписка в любой момент.',
  },
  en: {
    title: 'FLOW',
    subtitle: "I don't write. I select.",
    body: "A link, a video, a photo, a line: ten seconds and it's in the stream. The system does the rest: sorts, counts, sets the type. Once a week it becomes an issue with no newsroom, one person's taste multiplied by code.",
    footerNote: 'If you want to see how it ends, leave your address.',
    placeholder: 'you@example.com',
    button: 'Subscribe',
    submitting: 'Connecting...',
    successTitle: 'Welcome to the Flow',
    successText:
      'Thank you! The dispatch will arrive in your inbox shortly.',
    anotherEmail: 'Subscribe another email',
    privacy: 'Zero tracking. Instant one-click unsubscribe anytime.',
  },
};

export default function FlowJoinClient() {
  const [lang, setLang] = useState<Language>('ru');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Автоопределение языка браузера при первом входе
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
        throw new Error(
          data.error ||
            (lang === 'ru' ? 'Ошибка подписки' : 'Subscription failed')
        );
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
    <main className="min-h-screen bg-[#FAF8F5] text-stone-900 pt-28 sm:pt-36 pb-16 px-4 sm:px-6 flex flex-col justify-between relative selection:bg-stone-900 selection:text-white font-sans">
      {/* Тонкая минималистичная сетка галерейного фона */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:28px_28px] opacity-30 pointer-events-none" />

      <div className="relative z-10 max-w-xl mx-auto w-full my-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white/95 backdrop-blur-2xl border border-stone-200/80 rounded-3xl p-6 sm:p-12 shadow-[0_20px_60px_rgba(0,0,0,0.03)] relative overflow-hidden"
        >
          {/* Верхняя строка: Переключатель Языка */}
          <div className="flex justify-end mb-4">
            <div className="flex items-center gap-1 bg-stone-100/90 p-1 rounded-xl border border-stone-200/60 font-mono text-xs">
              <button
                type="button"
                onClick={() => setLang('ru')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
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
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  lang === 'en'
                    ? 'bg-stone-900 text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                EN
              </button>
            </div>
          </div>

          {/* Превью скриншот интерфейса / картинка */}
          <div className="mb-6 rounded-2xl overflow-hidden border border-stone-200/80 shadow-sm aspect-[16/9] bg-stone-100 relative">
            <img
              src={PREVIEW_IMAGE}
              alt="FLOW Interface Preview"
              className="w-full h-full object-cover"
            />
          </div>

          {/* Заголовок — строго только FLOW */}
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-stone-900 mb-3">
            {t.title}
          </h1>

          {/* Подзаголовок и авторский текст */}
          <div className="space-y-4 mb-8">
            <p className="text-base sm:text-xl font-medium text-stone-900 leading-snug">
              {t.subtitle}
            </p>
            <p className="text-xs sm:text-base text-stone-600 leading-relaxed font-serif">
              {t.body}
            </p>
            <p className="text-xs sm:text-sm font-mono text-stone-500 pt-1">
              {t.footerNote}
            </p>
          </div>

          {/* Форма ввода email / Сообщение об успехе */}
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
                <h3 className="text-base font-bold text-stone-900">
                  {t.successTitle}
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  {t.successText}
                </p>
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
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.placeholder}
                    className="w-full sm:flex-1 bg-stone-50/80 border border-stone-200 focus:border-stone-900 rounded-2xl py-3.5 px-4 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none transition-all shadow-inner"
                  />
                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer shadow-sm active:scale-95"
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
                  <p className="text-xs font-mono text-rose-600 pt-1 px-1">
                    {errorMessage}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-2 text-[11px] font-mono text-stone-400">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-stone-400" />
                  <span>{t.privacy}</span>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Футер-навигация */}
      <footer className="relative z-10 max-w-xl mx-auto w-full pt-10 text-center font-mono text-xs text-stone-400 flex justify-center gap-6">
        <Link href="/flow" className="hover:text-stone-900 transition-colors">
          FLOW FEED
        </Link>
        <span>•</span>
        <Link
          href="/art-engine"
          className="hover:text-stone-900 transition-colors"
        >
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
