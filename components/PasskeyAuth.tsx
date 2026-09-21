'use client';

import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      experimental: { passkey: true },
    },
  }
);

export default function PasskeyAuth() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      window.location.href = '/';
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

  return (
    <div className="flex flex-col gap-4 p-6 max-w-md mx-auto bg-neutral-900 rounded-xl border border-white/10 text-white">
      <h2 className="text-xl font-bold">Авторизация по Passkey</h2>
      <p className="text-sm text-neutral-400">
        Используйте биометрию (Face ID, Touch ID, Windows Hello) для безопасного входа.
      </p>

      {message && (
        <div className="p-3 text-sm bg-white/5 rounded border border-white/10">
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
        {loading ? 'Загрузка...' : 'Привязать Passkey к аккаунту'}
      </button>
    </div>
  );
}
