import React from 'react';

export default function DonateButton() {
  const handleDonate = async () => {
  const amount = 1000; // 10.00 EUR (Stripe в центах)
  const currency = 'eur';
    const successUrl = window.location.origin + '/?donate=success';
    const cancelUrl = window.location.origin + '/?donate=cancel';
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency, successUrl, cancelUrl }),
    });
    const data = await res.json();
    if (data?.url) {
      window.location.href = data.url;
    } else {
      const errorMsg = data?.error ? `Ошибка Stripe: ${data.error}` : 'Ошибка при создании сессии Stripe.';
      // Вывести ошибку в alert и консоль для диагностики
      alert(errorMsg);
       
      console.error('Stripe donate error:', data);
    }
  };

  return (
    <button
      onClick={handleDonate}
      className="mt-4 w-full rounded-md bg-yellow-400 px-4 py-2 text-sm font-semibold text-gray-900 shadow hover:bg-yellow-300 transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
    >
      Поддержать проект 💛
    </button>
  );
}
