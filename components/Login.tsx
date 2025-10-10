"use client";

import { usePrivy } from '@privy-io/react-auth';
import { useState } from 'react';

export default function Login() {
  const { login, authenticated, getAccessToken } = usePrivy();
  const [result, setResult] = useState<string | null>(null);

  const handleLogin = async () => {
    await login();
    if (authenticated) {
      const token = await getAccessToken();
      console.log('Token:', token); // Дебаг токена
      const res = await fetch('/api/privy-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken: token }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    }
  };

  return (
    <div>
      <button onClick={handleLogin}>Login with Privy</button>
      {result && (
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 16 }}>{result}</pre>
      )}
    </div>
  );
}
