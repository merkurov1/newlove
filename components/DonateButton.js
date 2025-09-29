import React from 'react';

export default function DonateButton() {
  const handleDonate = async () => {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data?.url) {
      window.location.href = data.url;
    } else {
      alert('Ошибка при создании сессии Stripe.');
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
