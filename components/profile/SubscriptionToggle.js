'use client';
import { useState } from 'react';

export default function SubscriptionToggle({ initialSubscribed = false, email = null }) {
  const [isSubscribed, setIsSubscribed] = useState(!!initialSubscribed);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const toggle = async () => {
    setLoading(true);
    setMsg(null);
    try {
      if (!isSubscribed) {
        // subscribe via server action endpoint
        const form = new FormData();
        form.append('email', email || '');
        const res = await fetch('/api/subscribe', { method: 'POST', body: form });
        const j = await res.json();
        if (res.ok) {
          setIsSubscribed(true);
          setMsg(j?.message || 'Подписка оформлена. Проверьте почту.');
        } else {
          setMsg(j?.message || 'Ошибка при подписке');
        }
      } else {
        // Unsubscribe: call unsubscribe API (requires token flow) — fallback to simple removal by email
        const res = await fetch('/api/newsletter-unsubscribe', { method: 'POST', body: JSON.stringify({ email }) , headers: { 'Content-Type': 'application/json' } });
        if (res.ok) {
          setIsSubscribed(false);
          setMsg('Вы отписаны от рассылки.');
        } else {
          const j = await res.json();
          setMsg(j?.message || 'Ошибка при отписке');
        }
      }
    } catch (e) {
      setMsg(String(e));
    }
    setLoading(false);
  };

  return (
    <div>
      <button onClick={toggle} disabled={loading} className={`inline-flex items-center gap-2 px-4 py-2 rounded-md ${isSubscribed ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'}`}>
        {loading ? 'Секунду...' : isSubscribed ? 'Отписаться' : 'Подписаться'}
      </button>
      {msg && <p className="mt-2 text-sm text-gray-700">{msg}</p>}
    </div>
  );
}
