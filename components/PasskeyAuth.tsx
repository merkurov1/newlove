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
  const [email, setEmail] = useState('');

  const syncUserToDatabase = async () => {
    try {
      await fetch('/api/auth/upsert', { method: 'POST' });
    } catch (e) {
      console.error('Sync error:', e);
    }
  };

  const handlePasskeyLogin = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;

      await syncUserToDatabase();
      setMessage('Успешный вход! Перенаправление...');
      window.location.href = '/admin';
    } catch (err: any) {
      setMessage(`Ошибка входа: ${err.message || err}`);
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

      setMessage('Пароль-ключ (Passkey) успешно привязан!');
    } catch (err: any) {
      setMessage(`Ошибка регистрации: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLinkLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setMessage('Введите email для отправки ссылки');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/admin`,
        },
      });
      if (error) throw error;
      setMessage('Ссылка для входа отправлена на почту! Проверьте входящие.');
    } catch (err: any) {
      setMessage(`Ошибка отправки ссылки: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 max-w-md mx-auto bg-neutral-900 rounded-xl border border-white/10 text-white shadow-xl">
      <h2 className="text-xl font-bold">Авторизация и Passkey</h2>
      <p className="text-sm text-neutral-400">
        Войдите по биометрии или запросите ссылку на почту, чтобы создать сессию и привязать Passkey.
      </p>

      {message && (
        <div className="p-3 text-sm bg-white/5 rounded border border-white/10 text-neutral-200">
          {message}
        </div>
      )}

      <button
        onClick={handlePasskeyLogin}
        disabled={loading}
        className="w-full py-2.5 px-4 bg-white text-black font-medium rounded-lg hover:bg-neutral-200 transition disabled:opacity-50 cursor-pointer"
      >
        {loading ? 'Загрузка...' : 'Войти по Passkey'}
      </button>

      <button
        onClick={handleRegisterPasskey}
        disabled={loading}
        className="w-full py-2.5 px-4 bg-neutral-800 text-white font-medium rounded-lg hover:bg-neutral-700 transition border border-white/10 disabled:opacity-50 text-sm cursor-pointer"
      >
        {loading ? 'Загрузка...' : 'Привязать Passkey (требуется сессия)'}
      </button>

      <div className="border-t border-white/10 my-2"></div>

      <form onSubmit={handleMagicLinkLogin} className="flex flex-col gap-2">
        <label className="text-xs text-neutral-400">Или войти по Magic Link (создать сессию):</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="merkurov@gmail.com"
          className="p-2.5 bg-neutral-800 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 transition disabled:opacity-50 text-sm cursor-pointer"
        >
          {loading ? 'Отправка...' : 'Отправить Magic Link'}
        </button>
      </form>
    </div>
  );
}
