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
      setError('Incorrect password.');
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
        setStripeError(data?.error || 'Error creating Stripe session');
      }
    } catch (e: any) {
      setStripeError(e.message || 'Stripe error');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 p-8 bg-white/90 dark:bg-gray-900/75 backdrop-blur-sm rounded-lg shadow-lg text-center">
      <h2 className="text-2xl font-extrabold mb-3">Access to Unframed</h2>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
        The book is available after payment or by password (invited users).
      </p>
      <form onSubmit={handlePassword} className="mb-4">
        <input
          type="password"
          className="border px-4 py-2 rounded w-full mb-2 bg-white dark:bg-gray-800 text-sm"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="submit"
          className="w-full bg-brand-500 text-white py-2 rounded font-semibold hover:bg-brand-600 transition"
        >
          Unlock with password
        </button>
        {error && <div className="text-red-600 mt-2">{error}</div>}
      </form>
      <div className="my-4 text-gray-500">or</div>
      <button
        className="w-full bg-primary text-white py-2 rounded font-semibold hover:opacity-90 transition"
        onClick={handleStripe}
        disabled={showStripe}
      >
        {showStripe ? 'Redirecting to payment...' : 'Buy access via Stripe'}
      </button>
      {stripeError && <div className="text-red-600 mt-4">{stripeError}</div>}
    </div>
  );
}
