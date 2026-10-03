// components/profile/SubscriptionToggle.js
'use client';

import { useActionState, useFormStatus } from 'react';
import { toggleUserSubscription } from '@/app/admin/actions';
import { useEffect, useState } from 'react';

function SubmitButton({ isSubscribed }) {
  const { pending } = useFormStatus();
  return (
    <button 
      type="submit" 
      disabled={pending}
      className={`px-6 py-3 rounded-full text-xs font-mono uppercase tracking-widest transition-all shadow-sm active:scale-98 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
        isSubscribed 
          ? 'bg-stone-200 text-stone-800 hover:bg-stone-300' 
          : 'bg-stone-900 text-stone-100 hover:bg-stone-800'
      }`}
    >
      {pending ? 'Processing...' : (isSubscribed ? 'Unsubscribe' : 'Subscribe')}
    </button>
  );
}

export default function SubscriptionToggle({ initialSubscribed = false }) {
  const [isSubscribed, setIsSubscribed] = useState(!!initialSubscribed);
  const initialState = { message: null, status: null };
  const [state, formAction] = useActionState(toggleUserSubscription, initialState);
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    if (state?.status === 'success') {
      setIsSubscribed(!isSubscribed);
      setShowMessage(true);
      const timer = setTimeout(() => setShowMessage(false), 4000);
      return () => clearTimeout(timer);
    } else if (state?.status === 'error') {
      setShowMessage(true);
      const timer = setTimeout(() => setShowMessage(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [state, isSubscribed]);

  return (
    <div className="bg-white/85 backdrop-blur-2xl p-6 sm:p-10 rounded-3xl border border-stone-200/80 shadow-sm space-y-6">
      <div>
        <h2 className="font-serif text-xl sm:text-2xl text-stone-900 tracking-tight mb-2">
          Newsletter Subscription
        </h2>
        <p className="font-serif text-sm text-stone-600 leading-relaxed font-light">
          {isSubscribed 
            ? 'You are currently subscribed to the weekly newsletter featuring new articles and projects.' 
            : 'Subscribe to receive new articles, reflections, and insights directly in your inbox.'}
        </p>
      </div>

      <form action={formAction} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-stone-200/80">
        <input type="hidden" name="action" value={isSubscribed ? 'unsubscribe' : 'subscribe'} />
        
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${isSubscribed ? 'bg-emerald-500' : 'bg-stone-300'}`}></div>
          <span className="font-mono text-xs uppercase tracking-wider text-stone-600 font-medium">
            {isSubscribed ? 'Active' : 'Inactive'}
          </span>
        </div>

        <SubmitButton isSubscribed={isSubscribed} />
      </form>

      {showMessage && state?.message && (
        <div className={`p-3 rounded-2xl border text-xs font-mono ${
          state.status === 'success' 
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
            : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          {state.message}
        </div>
      )}
    </div>
  );
}
