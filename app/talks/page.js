'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import TalksInterface from '@/components/TalksInterface';

export default function Talks() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    const savedPassword = localStorage.getItem('talks_password');
    if (savedPassword === process.env.NEXT_PUBLIC_TALKS_PASSWORD) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === process.env.NEXT_PUBLIC_TALKS_PASSWORD) {
      localStorage.setItem('talks_password', password);
      setIsAuthenticated(true);
    } else {
      alert('Неверный пароль');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <form onSubmit={handleLogin} className="p-4 border rounded-lg">
          <h2 className="text-lg font-bold mb-4">Доступ к Talks</h2>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            className="border p-2 rounded w-full mb-2"
          />
          <button type="submit" className="bg-blue-500 text-white p-2 rounded w-full">
            Войти
          </button>
        </form>
      </div>
    );
  }

  return <TalksInterface />;
}