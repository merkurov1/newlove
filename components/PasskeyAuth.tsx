'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase-browser';

export default function PasskeyAuth() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState('merkurov@gmail.com');
  const [password, setPassword] = useState('');

  const handlePasskeyLogin = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;

      setMessage('Success! Redirecting...');
      window.location.href = '/admin';
    } catch (err: any) {
      setMessage(`Passkey error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      setMessage('Session created! Redirecting...');
      window.location.href = '/admin';
    } catch (err: any) {
      setMessage(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-neutral-900 rounded-2xl border border-white/10 text-white max-w-sm mx-auto my-8 shadow-2xl">
      <h3 className="text-lg font-bold mb-2">Admin Sign In</h3>
      {message && (
        <div className="p-2 mb-3 text-xs bg-white/5 rounded border border-white/10 text-neutral-300">
          {message}
        </div>
      )}
      
      <button
        type="button"
        onClick={handlePasskeyLogin}
        disabled={loading}
        className="w-full py-2.5 px-4 bg-white text-black font-semibold rounded-xl hover:bg-neutral-200 transition text-sm mb-4 cursor-pointer disabled:opacity-50"
      >
        {loading ? 'Processing...' : 'Sign in with Passkey'}
      </button>

      <div className="relative flex py-2 items-center">
        <div className="flex-grow border-t border-white/10"></div>
        <span className="flex-shrink mx-4 text-xs text-neutral-500 uppercase tracking-widest">or</span>
        <div className="flex-grow border-t border-white/10"></div>
      </div>

      <form onSubmit={handleEmailPasswordLogin} className="flex flex-col gap-2.5 mt-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="p-2.5 bg-neutral-800 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-white/30"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className="p-2.5 bg-neutral-800 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-white/30"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 transition text-sm cursor-pointer mt-1 disabled:opacity-50"
        >
          {loading ? 'Working...' : 'Bootstrap Session'}
        </button>
      </form>
    </div>
  );
}
