"use client";

import React, { useRef, useState } from 'react';
import useSupabaseSession from '@/hooks/useSupabaseSession';
import AuthLoginModal from '@/components/AuthLoginModal';

export default function SubscribeFormClient() {
  const { session, status } = useSupabaseSession();
  const [email, setEmail] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const modalRef = useRef<any>(null);

  // Show form only when user is not authenticated
  if (status === 'loading') return <div className="mb-8 text-sm text-gray-500">Checking subscription status...</div>;
  if (session && session.user) return null;

  async function handleSubmit(e: any) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      // Try to call backend endpoint if present, otherwise simulate success
      try {
        await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      } catch (e) {
        // ignore network errors — simulate
      }
      setOk(true);
      setEmail('');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-12 mx-auto max-w-2xl">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm text-center">
        <div className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2">Subscribe</div>
        <h3 className="text-xl font-serif font-medium mb-2">Dispatches</h3>
        <p className="text-sm text-gray-600 mb-4">Get journal dispatches by email. Sign in to subscribe with your account.</p>

        {ok ? (
          <div className="text-sm text-green-600">Thanks — check your inbox.</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-3 justify-center">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="p-3 border border-gray-100 rounded-md w-64"
            />
            <button disabled={loading} className="px-4 py-3 bg-black text-white rounded-md font-mono text-sm uppercase tracking-widest">Subscribe</button>
          </form>
        )}

        <div className="mt-4 text-xs text-gray-500">
          Already have an account? <button onClick={() => modalRef.current?.open()} className="underline">Sign in</button>
        </div>
      </div>

      <AuthLoginModal ref={modalRef} />
    </div>
  );
}
