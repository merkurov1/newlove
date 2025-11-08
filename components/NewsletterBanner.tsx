'use client';

import { useAuth } from '@/components/AuthContext';
import { useFormState } from 'react-dom';
import { subscribeToNewsletter } from '@/app/admin/actions';
import { useEffect, useRef, useState } from 'react';

function SubmitButton() {
  return (
    <button 
      type="submit" 
      className="flex-shrink-0 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      Подписаться
    </button>
  );
}

export default function NewsletterBanner() {
  const { session } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);

  const initialState: any = { message: null, status: null };
  const [state, formAction]: any = useFormState(subscribeToNewsletter, initialState);

  // Проверка подписки для залогиненных пользователей
  useEffect(() => {
    const checkSubscriptionStatus = async () => {
      if (session?.user?.id) {
        try {
          const response = await fetch('/api/subscription-status');
          if (response.ok) {
            const data = await response.json();
            setIsSubscribed(data.isSubscribed);
          }
        } catch (error) {
          console.error('Error checking subscription:', error);
        }
      }
      setCheckingSubscription(false);
    };

    checkSubscriptionStatus();
  }, [session]);

  // Сброс формы после успешной подписки
  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setIsSubscribed(true);
    }
  }, [state]);

  // Не показываем баннер залогиненным и подписанным пользователям
  if (session && isSubscribed) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-b border-blue-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Текст */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">💌</span>
              <h3 className="text-xl font-bold text-gray-900">
                Подпишитесь на рассылку
              </h3>
            </div>
            <p className="text-sm text-gray-600 max-w-2xl">
              Получайте новые письма и статьи прямо на почту. Только качественный контент, без спама.
            </p>
          </div>

          {/* Форма */}
          <div className="flex-shrink-0 w-full md:w-auto md:min-w-[400px]">
            {checkingSubscription ? (
              <div className="animate-pulse flex gap-2">
                <div className="flex-1 h-10 bg-gray-200 rounded-lg"></div>
                <div className="w-32 h-10 bg-gray-200 rounded-lg"></div>
              </div>
            ) : (
              <form ref={formRef} action={formAction} className="space-y-3">
                <div className="flex gap-2">
                  <input 
                    type="email" 
                    name="email"
                    placeholder="your.email@example.com"
                    defaultValue={session?.user?.email ?? ''}
                    readOnly={!!session?.user?.email}
                    required 
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all bg-white"
                  />
                  <SubmitButton />
                </div>

                {state?.message && (
                  <div className={`text-sm p-2 rounded-lg ${
                    state.status === 'error' 
                      ? 'bg-red-50 text-red-600 border border-red-100' 
                      : 'bg-green-50 text-green-600 border border-green-100'
                  }`}>
                    {state.message}
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
