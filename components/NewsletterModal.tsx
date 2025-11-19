'use client';

import { useAuth } from '@/components/AuthContext';
import { useFormState } from 'react-dom';
import { subscribeToNewsletter } from '@/app/admin/actions';
import { useEffect, useRef, useState } from 'react';

const MODAL_STORAGE_KEY = 'newsletter_modal_last_shown';
const SHOW_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 часа

function SubmitButton() {
  return (
    <button 
      type="submit" 
      className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-5 sm:px-6 py-3 text-sm sm:text-base font-semibold text-white shadow-lg transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 min-h-[44px]"
    >
      Подписаться
    </button>
  );
}

export default function NewsletterModal() {
  const { session } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const hasCheckedRef = useRef(false);

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

  // Логика показа модального окна
  useEffect(() => {
    // Не показываем если еще проверяем подписку
    if (checkingSubscription) return;

    // Не показываем подписанным пользователям
    if (isSubscribed) return;

    // Проверяем только один раз
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    // Проверяем когда последний раз показывали
    const lastShown = localStorage.getItem(MODAL_STORAGE_KEY);
    const now = Date.now();

    if (lastShown) {
      const timeSinceLastShown = now - parseInt(lastShown, 10);
      if (timeSinceLastShown < SHOW_INTERVAL_MS) {
        // Еще не прошло 24 часа
        return;
      }
    }

    // Показываем модалку с небольшой задержкой для UX
    const timer = setTimeout(() => {
      setIsOpen(true);
      // НЕ ставим метку здесь - только при закрытии
    }, 2000); // 2 секунды после загрузки страницы

    return () => clearTimeout(timer);
  }, [checkingSubscription, isSubscribed]);

  // Закрытие после успешной подписки
  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setIsSubscribed(true);
      // Закрываем через 3 секунды чтобы пользователь увидел сообщение
      setTimeout(() => {
        handleClose();
      }, 3000);
    }
  }, [state]);

  const handleClose = () => {
    // Ставим метку времени при закрытии модалки (неважно как - через крестик или фон)
    localStorage.setItem(MODAL_STORAGE_KEY, Date.now().toString());
    setIsOpen(false);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Проверяем что клик именно по backdrop, а не по содержимому
      if (e.target === e.currentTarget) {
        handleClose();
      }
  };

  // Закрытие по нажатию Escape и блокировка скролла
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      // Блокируем скролл страницы когда модалка открыта
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
      
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 animate-fadeIn"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="newsletter-modal-title"
    >
      <div 
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Кнопка закрытия */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          aria-label="Закрыть"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Декоративный фон */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-200/40 to-indigo-200/40 rounded-full blur-3xl -z-0"></div>

        {/* Контент */}
        <div className="relative z-10 p-8">
          {/* Иконка */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-4xl">💌</span>
            </div>
          </div>

          {/* Заголовок */}
          <h2 id="newsletter-modal-title" className="text-2xl font-bold text-center text-gray-900 mb-3">
            Подпишитесь на рассылку
          </h2>

          {/* Описание */}
          <p className="text-center text-gray-600 mb-6">
            Получайте новые статьи и инсайты медиарынка прямо на почту. Только качественный контент, без спама.
          </p>

          {/* Форма */}
          <form ref={formRef} action={formAction} className="space-y-4">
            <div>
              <input 
                type="email" 
                name="email"
                placeholder="your.email@example.com"
                defaultValue={session?.user?.email ?? ''}
                readOnly={!!session?.user?.email}
                required 
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>

            <SubmitButton />

            {state?.message && (
              <div className={`text-sm text-center p-3 rounded-lg ${
                state.status === 'error' 
                  ? 'bg-red-50 text-red-600 border border-red-100' 
                  : 'bg-green-50 text-green-600 border border-green-100'
              }`}>
                {state.message}
              </div>
            )}
          </form>

          {/* Нижний текст */}
          <p className="text-xs text-center text-gray-500 mt-6">
            Нажимая "Подписаться", вы соглашаетесь получать письма. Вы можете отписаться в любое время.
          </p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
