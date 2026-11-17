'use client';

import { useEffect } from 'react';

import { writeLocalSubscriptionState } from '@/lib/question/subscriptionStorage';

/**
 * Mirrors a confirmed/unsubscribed state into this browser's local hint so the
 * Question page can show the channel state for anonymous subscribers.
 */
export default function SubscriptionStateSync({
  questionId,
  state,
}: {
  questionId: string | null;
  state: string | null;
}) {
  useEffect(() => {
    if (!questionId || !state) return;

    if (state === 'email_confirmed') {
      writeLocalSubscriptionState(questionId, { email: 'active' });
    } else if (state === 'email_unsubscribed') {
      writeLocalSubscriptionState(questionId, { email: 'disabled' });
    } else if (state === 'telegram_unsubscribed') {
      writeLocalSubscriptionState(questionId, { telegram: 'disabled' });
    } else if (state === 'unsubscribed') {
      writeLocalSubscriptionState(questionId, { email: 'disabled', telegram: 'disabled' });
    }
  }, [questionId, state]);

  return null;
}
