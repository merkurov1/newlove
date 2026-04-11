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
  const [reqName, setReqName] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqMessage, setReqMessage] = useState('');
  const [reqStatus, setReqStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Password unlock removed from UI; keep handler for compatibility if needed
  const handlePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (VALID_PASSWORDS.includes(password.trim())) {
      onUnlock();
    } else {
      setError('Incorrect password.');
    }
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setReqStatus('loading');
    try {
      const payload = { form: { name: reqName, email: reqEmail, message: reqMessage } };
      const res = await fetch('/api/unframed/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Request failed');
      setReqStatus('success');
      setReqName('');
      setReqEmail('');
      setReqMessage('');
    } catch (err) {
      console.error('Request error', err);
      setReqStatus('error');
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
    <div className="max-w-md mx-auto mt-24 p-8 bg-white/90 dark:bg-gray-900/75 backdrop-blur-sm rounded-lg shadow-lg text-center">
      <h2 className="text-2xl font-extrabold mb-3">Access to Unframed</h2>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
        The book is available after payment or by password (invited users).
      </p>
      {/* Password unlock hidden — provide request-access form instead */}
      <form onSubmit={handleRequest} className="mb-4 text-left">
        <label className="block text-sm mb-1">Name</label>
        <input
          type="text"
          className="border px-4 py-2 rounded w-full mb-2 bg-white dark:bg-gray-800 text-sm"
          placeholder="Your name"
          value={reqName}
          onChange={(e) => setReqName(e.target.value)}
          required
        />
        <label className="block text-sm mb-1">Email</label>
        <input
          type="email"
          className="border px-4 py-2 rounded w-full mb-2 bg-white dark:bg-gray-800 text-sm"
          placeholder="your@email.com"
          value={reqEmail}
          onChange={(e) => setReqEmail(e.target.value)}
          required
        />
        <label className="block text-sm mb-1">Message</label>
        <textarea
          className="border px-4 py-2 rounded w-full mb-2 bg-white dark:bg-gray-800 text-sm"
          placeholder="Why you need access (optional)"
          value={reqMessage}
          onChange={(e) => setReqMessage(e.target.value)}
          rows={3}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 bg-brand-500 text-white py-2 rounded font-semibold hover:opacity-90 transition"
            disabled={reqStatus === 'loading'}
          >
            {reqStatus === 'loading' ? 'Sending…' : 'Request access'}
          </button>
          <button
            type="button"
            onClick={() => {
              setReqName('');
              setReqEmail('');
              setReqMessage('');
              setReqStatus('idle');
            }}
            className="px-4 py-2 border rounded"
          >
            Clear
          </button>
        </div>
        {reqStatus === 'success' && (
          <div className="text-green-600 mt-2">Request sent — thank you.</div>
        )}
        {reqStatus === 'error' && <div className="text-red-600 mt-2">Error sending request.</div>}
      </form>
      <div className="my-4 text-gray-500">or</div>
      <button
        className="w-full bg-brand-500 text-white py-2 rounded font-semibold hover:opacity-90 transition"
        onClick={handleStripe}
        disabled={showStripe}
      >
        {showStripe ? 'Redirecting to payment...' : 'Buy access via Stripe'}
      </button>
      {stripeError && <div className="text-red-600 mt-4">{stripeError}</div>}
    </div>
  );
}
