'use client';

import React, { useState, useEffect } from 'react';
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsLoggedIn(true);
        syncTokensToCookies(session);
      }
    });
  }, []);

  const syncTokensToCookies = (session: any) => {
    if (!session) return;
    document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=3600; SameSite=Lax`;
    document.cookie = `sb-refresh-token=${session.refresh_token}; path=/; max-age=604800; SameSite=Lax`;
  };

  const handlePasskeyLogin = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      if (data?.session) syncTokensToCookies(data.session);

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
      if (data?.session) syncTokensToCookies(data.session);

      setMessage('Session created! Redirecting...');
      window.location.href = '/admin';
    } catch (err: any) {
      setMessage(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  if (isLoggedIn) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-emerald-400 font-mono">● Admin Session Active</span>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            document.cookie = 'sb-access-token=; path=/; max-age=0';
            document.cookie = 'sb-refresh-token=; path=/; max-age=0';
            window.location.reload();
          }}
          className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300 rounded-lg transition border border-white/10"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-neutral-900 rounded-2xl border border-white/10 text-white max-w-sm mx-auto my-8">
      <h3 className="text-lg font-bold mb-2">Admin Sign In</h3>
      {message && <div className="p-2 mb-3 text-xs bg-white/5 rounded border border-white/10 text-neutral-300">{message}</div>}
      
      <button
        onClick={handlePasskeyLogin}
        disabled={loading}
        className="w-full py-2.5 px-4 bg-white text-black font-semibold rounded-xl hover:bg-neutral-200 transition text-sm mb-4 cursor-pointer"
      >
        {loading ? 'Processing...' : 'Sign in with Passkey'}
      </button>

      <form onSubmit={handleEmailPasswordLogin} className="flex flex-col gap-2.5">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="p-2.5 bg-neutral-800 border border-white/10 rounded-xl text-sm text-white"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="p-2.5 bg-neutral-800 border border-white/10 rounded-xl text-sm text-white"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 transition text-sm cursor-pointer mt-1"
        >
          {loading ? 'Working...' : 'Bootstrap Session'}
        </button>
      </form>
    </div>
  );
}
