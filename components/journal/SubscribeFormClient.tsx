"use client";

import React, { useRef, useState, useEffect, type ElementRef } from 'react';
import useSupabaseSession from '@/hooks/useSupabaseSession';
import AuthLoginModal from '@/components/AuthLoginModal';

interface SubscribeFormClientProps {
  defaultLanguage?: 'ru' | 'en';
}

export default function SubscribeFormClient({ defaultLanguage }: SubscribeFormClientProps) {
  const { session } = useSupabaseSession();
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState<'ru' | 'en'>(defaultLanguage || 'ru');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Автоматически выводим точный тип рефа из компонента AuthLoginModal
  const modalRef = useRef<ElementRef<typeof AuthLoginModal>>(null);

  // Автоматическое определение языка браузера, если defaultLanguage не задан явно
  useEffect(() => {
    if (!defaultLanguage && typeof window !== 'undefined') {
      const browserLang = navigator.language.toLowerCase();
      if (browserLang.startsWith('ru')) {
        setLanguage('ru');
      } else {
        setLanguage('en');
      }
    }
  }, [defaultLanguage]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    
    setLoading(true);
    setErrorMsg('');

    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          language,
          userId: session?.user?.id || null,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || (language === 'ru' ? 'Ошибка при оформлении подписки' : 'Subscription failed'));
      }

      setOk(true);
      setEmail('');
    } catch (err: any) {
      console.error('Subscription error:', err);
      setErrorMsg(err.message || (language === 'ru' ? 'Произошла ошибка. Попробуйте позже.' : 'An error occurred. Please try again.'));
      setOk(false);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setOk(false);
    setErrorMsg('');
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-6 md:p-8 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/40 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
            {language === 'ru' ? 'Еженедельная рассылка' : 'Weekly Digest'}
          </span>
          
          {/* Selector for Language */}
          <div className="flex items-center gap-1 bg-neutral-200/60 dark:bg-neutral-800 p-0.5 rounded-lg text-xs font-mono">
            <button
              type="button"
              onClick={() => setLanguage('ru')}
              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                language === 'ru'
                  ? 'bg-white dark:bg-neutral-700 font-semibold text-black dark:text-white shadow-sm'
                  : 'text-neutral-500 hover:text-black dark:hover:text-white'
              }`}
            >
              RU
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                language === 'en'
                  ? 'bg-white dark:bg-neutral-700 font-semibold text-black dark:text-white shadow-sm'
                  : 'text-neutral-500 hover:text-black dark:hover:text-white'
              }`}
            >
              EN
            </button>
          </div>
        </div>

        {ok ? (
          <div className="py-4 text-center space-y-2">
            <p className="text-base font-medium text-emerald-600 dark:text-emerald-400">
              {language === 'ru'
                ? 'Спасибо! Выпуск придет на ваш email.'
                : 'Thank you! You are now subscribed.'}
            </p>
            <p className="text-xs text-neutral-500">
              {language === 'ru'
                ? 'Проверьте почту для подтверждения.'
                : 'Check your inbox for confirmation.'}
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="mt-2 text-xs font-mono text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 underline transition-colors cursor-pointer"
            >
              {language === 'ru' ? 'Указать другой email' : 'Subscribe another email'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={language === 'ru' ? 'ваш@email.com' : 'you@example.com'}
                className="flex-1 px-4 py-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition-all text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 dark:text-black text-white rounded-xl font-mono text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap shadow-sm"
              >
                {loading
                  ? (language === 'ru' ? 'Отправка...' : 'Submitting...')
                  : (language === 'ru' ? 'Подписаться' : 'Subscribe')}
              </button>
            </div>
            {errorMsg && (
              <p className="text-xs font-mono text-rose-500 pt-1">{errorMsg}</p>
            )}
          </form>
        )}

        {!session && (
          <div className="mt-4 pt-3 border-t border-neutral-200/40 dark:border-neutral-800 text-center text-xs text-neutral-500">
            {language === 'ru' ? 'Уже есть аккаунт? ' : 'Already have an account? '}
            <button
              type="button"
              onClick={() => modalRef.current?.open()}
              className="underline hover:text-black dark:hover:text-white transition-colors cursor-pointer"
            >
              {language === 'ru' ? 'Войти' : 'Sign in'}
            </button>
          </div>
        )}
      </div>

      <AuthLoginModal ref={modalRef} />
    </div>
  );
}
