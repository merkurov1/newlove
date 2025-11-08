// components/profile/SubscriptionToggle.js
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { toggleUserSubscription } from '@/app/admin/actions';
import { useEffect, useState } from 'react';

function SubmitButton({ isSubscribed }) {
  const { pending } = useFormStatus();
  return (
    <button 
      type="submit" 
      disabled={pending}
      className={`px-4 py-2 rounded-md shadow-sm text-sm font-medium text-white disabled:opacity-50 transition-colors ${
        isSubscribed 
          ? 'bg-gray-600 hover:bg-gray-700' 
          : 'bg-blue-600 hover:bg-blue-700'
      }`}
    >
      {pending ? '...' : (isSubscribed ? 'Отписаться' : 'Подписаться')}
    </button>
  );
}

export default function SubscriptionToggle({ initialSubscribed = false }) {
  const [isSubscribed, setIsSubscribed] = useState(!!initialSubscribed);
  const initialState = { message: null, status: null };
  const [state, dispatch] = useFormState(toggleUserSubscription, initialState);
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    if (state.status === 'success') {
      // Toggle local state
      setIsSubscribed(!isSubscribed);
      setShowMessage(true);
      const timer = setTimeout(() => setShowMessage(false), 3000);
      return () => clearTimeout(timer);
    } else if (state.status === 'error') {
      setShowMessage(true);
      const timer = setTimeout(() => setShowMessage(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [state, isSubscribed]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold text-gray-900 mb-3">Рассылка</h2>
      <p className="text-sm text-gray-600 mb-4">
        {isSubscribed 
          ? 'Вы подписаны на еженедельную рассылку с новыми статьями и проектами.' 
          : 'Подпишитесь на рассылку, чтобы получать новые статьи и инсайты медиарынка прямо на почту.'}
      </p>

      <form action={dispatch} className="flex items-center gap-4">
        <input type="hidden" name="action" value={isSubscribed ? 'unsubscribe' : 'subscribe'} />
        
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isSubscribed ? 'bg-green-500' : 'bg-gray-300'}`}></div>
          <span className="text-sm font-medium text-gray-700">
            {isSubscribed ? 'Активна' : 'Неактивна'}
          </span>
        </div>

        <SubmitButton isSubscribed={isSubscribed} />
      </form>

      {showMessage && state.message && (
        <div className={`mt-4 p-3 rounded-md text-sm ${
          state.status === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {state.message}
        </div>
      )}
    </div>
  );
}
