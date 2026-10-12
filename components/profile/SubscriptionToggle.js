
'use client';

import { useFormStatus } from 'react-dom';
import { useFormState } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { toggleUserSubscription } from '@/app/admin/actions';

const initialState = {
  status: null,
  message: null,
};

function SubmitButton({ isSubscribed }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-full px-6 py-3 text-xs font-mono uppercase tracking-widest transition-all shadow-sm active:scale-[0.98] cursor-pointer disabled:cursor-wait disabled:opacity-50 ${
        isSubscribed
          ? 'bg-stone-200 text-stone-800 hover:bg-stone-300'
          : 'bg-stone-900 text-stone-100 hover:bg-stone-800'
      }`}
    >
      {pending
        ? 'Processing…'
        : isSubscribed
          ? 'Unsubscribe'
          : 'Subscribe'}
    </button>
  );
}

export default function SubscriptionToggle({
  initialSubscribed = false,
}) {
  const [isSubscribed, setIsSubscribed] = useState(
    Boolean(initialSubscribed),
  );

  const [state, formAction] = useFormState(
    toggleUserSubscription,
    initialState,
  );

  const [visibleMessage, setVisibleMessage] = useState(null);
  const processedState = useRef(null);

  useEffect(() => {
    if (!state?.status || processedState.current === state) {
      return;
    }

    processedState.current = state;

    if (state.status === 'success') {
      setIsSubscribed((current) => !current);
    }

    setVisibleMessage({
      status: state.status,
      message: state.message || '',
    });

    const timer = window.setTimeout(() => {
      setVisibleMessage(null);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <section className="space-y-6 rounded-3xl border border-stone-200/80 bg-white/85 p-6 shadow-sm backdrop-blur-2xl sm:p-10">
      <div>
        <h2 className="mb-2 font-serif text-xl tracking-tight text-stone-900 sm:text-2xl">
          Newsletter Subscription
        </h2>

        <p className="font-serif text-sm font-light leading-relaxed text-stone-600">
          {isSubscribed
            ? 'You are currently subscribed to the weekly newsletter featuring new articles and projects.'
            : 'Subscribe to receive new articles, reflections, and insights directly in your inbox.'}
        </p>
      </div>

      <form
        action={formAction}
        className="flex flex-col justify-between gap-4 border-t border-stone-200/80 pt-4 sm:flex-row sm:items-center"
      >
        <input
          type="hidden"
          name="action"
          value={isSubscribed ? 'unsubscribe' : 'subscribe'}
        />

        <div className="flex items-center gap-2.5" aria-live="polite">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isSubscribed ? 'bg-emerald-500' : 'bg-stone-300'
            }`}
            aria-hidden="true"
          />

          <span className="font-mono text-xs font-medium uppercase tracking-wider text-stone-600">
            {isSubscribed ? 'Active' : 'Inactive'}
          </span>
        </div>

        <SubmitButton isSubscribed={isSubscribed} />
      </form>

      {visibleMessage?.message && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-2xl border p-3 text-xs font-mono ${
            visibleMessage.status === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {visibleMessage.message}
        </div>
      )}
    </section>
  );
}
