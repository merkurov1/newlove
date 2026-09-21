'use client';

import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      experimental: { passkey: true },
    },
  }
);

export default function PasskeyAuth() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState('merkurov@gmail.com');
  const [password, setPassword] = useState('');

  const syncUserToDatabase = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=3600; SameSite=Lax`;
      document.cookie = `sb-refresh-token=${session.refresh_token}; path=/; max-age=604800; SameSite=Lax`;

      await fetch('/api/auth/upsert', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (e) {
      console.error('Sync error (non-critical):', e);
    }
  };

  const handlePasskeyLogin = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;

      await syncUserToDatabase();
      setMessage('Success! Redirecting...');
      window.location.href = '/admin';
    } catch (err: any) {
      setMessage(`Passkey sign-in error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.registerPasskey();
      if (error) throw error;

      setMessage('Passkey successfully linked to this iPad!');
    } catch (err: any) {
      setMessage(`Registration error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setMessage('Please enter email and password');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      let { error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
      }

      await syncUserToDatabase();
      setMessage('Session created! Redirecting to admin...');
      window.location.href = '/admin';
    } catch (err: any) {
      setMessage(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col gap-5 p-8 bg-neutral-900 rounded-2xl border border-white/10 text-white shadow-2xl">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Admin Authentication</h2>
          <p className="text-sm text-neutral-400">
            Use biometrics for instant access or bootstrap your session below.
          </p>
        </div>

        {message && (
          <div className="p-3 text-sm bg-white/5 rounded-xl border border-white/10 text-neutral-200">
            {message}
          </div>
        )}

        <button
          onClick={handlePasskeyLogin}
          disabled={loading}
          className="w-full py-3 px-4 bg-white text-black font-semibold rounded-xl hover:bg-neutral-200 transition disabled:opacity-50 cursor-pointer shadow-md flex items-center justify-center gap-2"
        >
          <span>{loading ? 'Processing...' : 'Sign in with Passkey'}</span>
        </button>

        <button
          onClick={handleRegisterPasskey}
          disabled={loading}
          className="w-full py-2.5 px-4 bg-neutral-800 text-white font-medium rounded-xl hover:bg-neutral-700 transition border border-white/10 disabled:opacity-50 text-sm cursor-pointer"
        >
          {loading ? 'Processing...' : 'Link this iPad (Passkey)'}
        </button>

        <div className="border-t border-white/10 my-1"></div>

        <form onSubmit={handleEmailPasswordLogin} className="flex flex-col gap-3">
          <label className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Session Bootstrap</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="p-3 bg-neutral-800/80 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="p-3 bg-neutral-800/80 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 transition disabled:opacity-50 text-sm cursor-pointer shadow-md"
          >
            {loading ? 'Working...' : 'Create Session & Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
