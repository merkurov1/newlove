'use client';

import { useEffect, useId, useRef } from 'react';

import TurnstileWidget from '@/components/newsletter/TurnstileWidget';

/**
 * Server-validated honeypot, form age and optional Turnstile token.
 * The timestamp is generated in the browser only to measure form age; it is
 * not an identity signal and is never stored.
 */
export default function NewsletterBotFields({
  language = 'ru',
  turnstileResetKey = 0,
}: {
  language?: 'ru' | 'en';
  turnstileResetKey?: number;
}) {
  const fieldId = useId();
  const startedAtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (startedAtRef.current) {
      startedAtRef.current.value = String(Date.now());
    }
  }, []);

  return (
    <>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-5000px', top: 'auto' }}>
        <label htmlFor={`${fieldId}-website`}>Website</label>
        <input
          id={`${fieldId}-website`}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <input ref={startedAtRef} type="hidden" name="formStartedAt" defaultValue="" />
      <input type="hidden" name="language" value={language} />
      <TurnstileWidget name="turnstileToken" resetKey={turnstileResetKey} />
    </>
  );
}
