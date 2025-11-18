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
      Receive Signals
    </button>
  );
}

export default function NewsletterSubscribe() {
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

  // Сбрасываем форму после успешной подписки
  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setIsSubscribed(true);
    }
  }, [state]);

  // Не показываем для залогиненных подписчиков
  if (session && isSubscribed) {
    return null;
  }

  // Не показываем залогиненным
  if (session) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-100 rounded-2xl p-6 mb-8 shadow-sm">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
            <span className="text-2xl">💌</span>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Get new letters by email</h3>
            <p className="text-sm text-gray-600">
              Subscribe to receive new journal entries, articles, and insights. No spam, just
              thoughtful content.
            </p>
          </div>
        </div>

        <form ref={formRef} action={formAction} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              name="email"
              placeholder="your.email@example.com"
              required
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
            <SubmitButton />
          </div>

          {state?.message && (
            <div
              className={`text-sm p-3 rounded-lg ${
                state.status === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}
            >
              {state.message}
            </div>
          )}
        </form>

        <p className="text-xs text-gray-500 mt-3">
          By clicking "Receive Signals" you agree to receive emails. You can unsubscribe at any
          time.
        </p>
      </div>
    </div>
  );
}
