"use client";

import { usePrivy } from '@privy-io/react-auth';
import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function WalletLoginButton() {
  const { login, ready, authenticated, getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await login();
      const accessToken = await getAccessToken();
      console.log('Privy accessToken:', accessToken);
      if (!accessToken) {
        setError('Не удалось получить accessToken от Privy');
        setLoading(false);
        return;
      }
      const res = await signIn('privy', {
        accessToken,
        redirect: false,
      });
      if (res?.ok) {
        setError(null);
        // window.location.reload(); // если нужно
      } else {
        setError(res?.error || 'Ошибка входа через Privy');
        console.error('signIn error:', res);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
      console.error('handleLogin error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!ready || authenticated) return null;

  return (
    <button onClick={handleLogin} disabled={loading}>
      {loading ? 'Вход...' : 'Войти через Privy'}
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </button>
  );
}
