// components/PasswordGuard.tsx
'use client';

import { useState, type ReactNode } from 'react';

// Предположим, что пароль хранится в переменных окружения
const CORRECT_PASSWORD = process.env.NEXT_PUBLIC_TALKS_PASSWORD || '12345';

export default function PasswordGuard({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputPassword, setInputPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPassword === CORRECT_PASSWORD) {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Неверный пароль');
    }
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex justify-center items-center h-screen">
      <form onSubmit={handleSubmit} className="p-8 bg-white shadow-md rounded-lg">
        <h2 className="text-2xl font-bold mb-4">Требуется пароль</h2>
        <input
          type="password"
          value={inputPassword}
          // Вот исправление: было e.targetPassword
          onChange={(e) => setInputPassword(e.target.value)}
          placeholder="Введите пароль"
          className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <p className="text-red-500 mt-2">{error}</p>}
        <button
          type="submit"
          className="w-full bg-blue-600 text-white p-3 mt-4 rounded hover:bg-blue-700"
        >
          Войти
        </button>
      </form>
    </div>
  );
}
