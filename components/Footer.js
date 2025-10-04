'use client';

import { useSession } from 'next-auth/react';
import { useFormState } from 'react-dom';
import { subscribeToNewsletter } from '@/app/admin/actions';
import { useEffect, useRef, useState } from 'react';
import DonateButton from './DonateButton';
import Link from 'next/link';

// Компонент для кнопки, который показывает статус отправки
function SubmitButton() {
  // `pending` больше не доступно в `useFormState`, используем `useFormStatus` в дочернем компоненте
  // Это правильный паттерн для Next.js / React
  // Вместо этого, мы просто покажем сообщение после отправки.
  return (
    <button type="submit" className="flex-shrink-0 rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">
      Подписаться
    </button>
  );
}

export default function Footer({ subscriberCount }) {
  const { data: session } = useSession();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const formRef = useRef(null);

  // Начальное состояние для useFormState
  const initialState = { message: null, status: null };
  const [state, formAction] = useFormState(subscribeToNewsletter, initialState);

  // Проверяем статус подписки для залогиненных пользователей
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
          console.error('Error checking subscription status:', error);
        }
      }
      setCheckingSubscription(false);
    };

    checkSubscriptionStatus();
  }, [session]);

  // Сбрасываем форму после успешной подписки
  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setIsSubscribed(true); // Обновляем локальное состояние
    }
  }, [state]);

  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="container mx-auto px-4 py-10">
        <div className="flex flex-col md:flex-row md:items-start md:justify-center gap-10">
          <div className="flex-1 max-w-md mx-auto md:mx-0 flex flex-col gap-6">
            
            {/* Показываем разный контент в зависимости от статуса подписки */}
            {checkingSubscription ? (
              <div className="animate-pulse">
                <div className="h-6 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded mb-4"></div>
                <div className="h-10 bg-gray-200 rounded"></div>
              </div>
            ) : isSubscribed ? (
              // Для подписанных пользователей
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">✅</span>
                  <h3 className="text-lg font-semibold text-green-800">Вы подписаны на рассылку!</h3>
                </div>
                <p className="text-sm text-green-700 mb-4">
                  Спасибо, что остаетесь с нами. Новые письма приходят прямо на вашу почту.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link 
                    href="/letters"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    📮 Читать архив писем
                  </Link>
                  <Link 
                    href="/letters"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-green-600 text-green-600 rounded-md hover:bg-green-50 transition-colors text-sm font-medium"
                  >
                    🎨 Заказать открытку
                  </Link>
                </div>
              </div>
            ) : session ? (
              // Для залогиненных, но не подписанных пользователей
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">💌</span>
                  <h3 className="text-lg font-semibold text-blue-800">Подпишитесь на рассылку</h3>
                </div>
                <p className="text-sm text-blue-700 mb-4">
                  Получайте новые статьи и инсайты медиарынка прямо на почту. Только качественный контент, без спама.
                </p>
                <form ref={formRef} action={formAction} className="space-y-3">
                  <div className="flex items-start gap-2">
                    <input 
                      type="email" 
                      name="email"
                      defaultValue={session.user.email ?? ''}
                      readOnly
                      className="w-full rounded-md border-gray-300 px-4 py-2 text-sm shadow-sm bg-gray-100 text-gray-600 cursor-not-allowed"
                    />
                    <SubmitButton />
                  </div>
                  {state?.message && (
                    <p className={`text-sm ${state.status === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                      {state.message}
                    </p>
                  )}
                </form>
              </div>
            ) : (
              // Для неавторизованных пользователей
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Присоединяйтесь к рассылке</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Получайте новые статьи и инсайты медиарынка прямо на почту. Без спама.
                </p>
                <form ref={formRef} action={formAction} className="space-y-3">
                  <div className="flex items-start gap-2">
                    <input 
                      type="email" 
                      name="email"
                      placeholder="your.email@example.com" 
                      required 
                      className="w-full rounded-md border-gray-300 px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <SubmitButton />
                  </div>
                  {state?.message && (
                    <p className={`text-sm ${state.status === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                      {state.message}
                    </p>
                  )}
                </form>
              </div>
            )}
            
            <DonateButton />
          </div>
        </div>
        <div className="mt-10 border-t border-gray-200 pt-6 text-center text-xs text-gray-400">
          <p>&copy; {new Date().getFullYear()} Anton Merkurov. Все права защищены.</p>
          <p className="mt-2 text-xs text-gray-500">Subscribers: <span className="font-semibold">{subscriberCount}</span></p>
        </div>
      </div>
    </footer>
  );
}


