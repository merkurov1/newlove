import React, { useState } from 'react';

interface PaywallProps {
  onUnlock: () => void;
}

const VALID_PASSWORDS = [
  'unframed2026', // пример пароля, замените на свои
  'freeaccess',
];

export default function Paywall({ onUnlock }: PaywallProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showStripe, setShowStripe] = useState(false);
  const [stripeError, setStripeError] = useState('');

  const handlePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (VALID_PASSWORDS.includes(password.trim())) {
      onUnlock();
    } else {
      setError('Неверный пароль.');
    }
  };

  const handleStripe = async () => {
    setShowStripe(true);
    setStripeError('');
    try {
      const res = await fetch('/api/unframed/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          successUrl: window.location.origin + '/unframed/book/?paid=1',
          cancelUrl: window.location.origin + '/unframed/book/?cancel=1',
        }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setStripeError(data?.error || 'Ошибка при создании Stripe-сессии');
      }
    } catch (e: any) {
      setStripeError(e.message || 'Ошибка Stripe');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-16 p-8 bg-white rounded shadow text-center">
      <h2 className="text-2xl font-bold mb-4">Доступ к книге Unframed</h2>
      <p className="mb-6">Книга доступна после оплаты или по паролю (для приглашённых).</p>
      <form onSubmit={handlePassword} className="mb-4">
        <input
          type="password"
          className="border px-4 py-2 rounded w-full mb-2"
          placeholder="Введите пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="submit"
          className="w-full bg-pink-600 text-white py-2 rounded font-semibold hover:bg-pink-700 transition"
        >
          Войти по паролю
        </button>
        {error && <div className="text-red-600 mt-2">{error}</div>}
      </form>
      <div className="my-4 text-gray-500">или</div>
      <button
        className="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700 transition"
        onClick={handleStripe}
        disabled={showStripe}
      >
        {showStripe ? 'Переход к оплате...' : 'Купить доступ через Stripe'}
      </button>
      {stripeError && <div className="text-red-600 mt-4">{stripeError}</div>}
    </div>
  );
}
