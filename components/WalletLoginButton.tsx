"use client";

import { usePrivy } from '@privy-io/react-auth';
import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function WalletLoginButton() {
  const { login, ready, authenticated, getAccessToken, getIdToken } = usePrivy();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [debug, setDebug] = useState<{ authenticated: boolean; accessToken: string | null }>({ authenticated: false, accessToken: null });
  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await login();
      // authenticated обновится только после login, но usePrivy не сразу триггерит rerender
      // Try id token first (contains user data if enabled in Privy), then access token
      const idToken = typeof getIdToken === 'function' ? await getIdToken() : null;
      const accessToken = await getAccessToken();
      const tokenToSend = idToken || accessToken;
      setDebug({ authenticated, accessToken: tokenToSend });
      if (!tokenToSend) {
        setError('Не удалось получить токен от Privy (idToken/accessToken)');
        setLoading(false);
        return;
      }
      const res = await signIn('privy', {
        accessToken: tokenToSend,
        redirect: false,
      });
      if (res?.ok) {
        setError(null);
        // window.location.reload(); // если нужно
      } else {
        setError(res?.error || 'Ошибка входа через Privy');
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!ready || authenticated) return null;

  return (
    <div>
      <button onClick={handleLogin} disabled={loading}>
        {loading ? 'Вход...' : 'Войти через Privy'}
      </button>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div style={{ fontSize: 12, marginTop: 8, color: '#888' }}>
        <div>Privy authenticated: <b>{String(debug.authenticated)}</b></div>
        <div>Privy accessToken: <b style={{ wordBreak: 'break-all' }}>{debug.accessToken || 'null'}</b></div>
      </div>
    </div>
  );
}
