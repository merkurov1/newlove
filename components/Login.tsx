"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabase-client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setResult(error ? error.message : 'Check your email for the login link.');
    setLoading(false);
  };

  // TODO: Add wallet login via Onboard if needed

  return (
    <div>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email"
        className="border px-2 py-1 rounded mr-2"
      />
      <button onClick={handleEmailLogin} disabled={loading}>
        {loading ? 'Sending...' : 'Login with Email'}
      </button>
      {result && (
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 16 }}>{result}</pre>
      )}
    </div>
  );
}
