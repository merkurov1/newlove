'use client';

import { useState } from 'react';

export default function PasswordGuard({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputPassword, setInputPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPassword === process.env.NEXT_PUBLIC_LOUNGE_PASSWORD) {
      setIsAuthenticated(true);
    } else {
      alert('Неверный пароль');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <form onSubmit={handleSubmit} className="p-6 bg-white rounded-lg shadow-xl">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Добро пожаловать в Гостиную</h2>
          <input
            type="password"
            value={inputPassword}
            onChange={(e) => setInputPassword(e.targetPassword)}
            placeholder="Введите пароль"
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded"
          >
            Войти
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}