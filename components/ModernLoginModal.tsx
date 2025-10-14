"use client";
import { useState } from "react";
import useSupabaseSession from '@/hooks/useSupabaseSession';

export default function ModernLoginModal() {
  const { session, signIn, status, error } = useSupabaseSession() as any;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (status === 'authenticated') return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (signIn) await signIn(email, password);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={handleLogin} className="bg-white rounded-lg shadow-lg p-8 w-full max-w-sm flex flex-col gap-4">
        <h2 className="text-2xl font-bold mb-2">Вход</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="border rounded px-3 py-2"
          required
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="border rounded px-3 py-2"
          required
        />
        <button
          type="submit"
          className="bg-blue-600 text-white rounded px-4 py-2 font-semibold hover:bg-blue-700 transition"
          disabled={loading}
        >
          {loading ? 'Входим...' : 'Войти'}
        </button>
        {error && <div className="text-red-600 text-sm">{error}</div>}
      </form>
    </div>
  );
}
