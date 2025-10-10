"use client";

import { usePrivy } from '@privy-io/react-auth';
import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function WalletLoginButton() {
  const { login, ready, authenticated, getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);

  const handleWalletLogin = async () => {
    setLoading(true);
    try {
      await login();
      const authToken = await getAccessToken();
      // Теперь используем NextAuth для полноценной сессии
      const res = await signIn('privy', {
        authToken,
        redirect: true,
        callbackUrl: '/',
      });
      // signIn сам обработает редирект и сессию
    } catch (e) {
      const msg = (e && typeof e === 'object' && 'message' in e) ? (e as Error).message : String(e);
      alert('Ошибка входа через кошелек: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  if (!ready || authenticated) return null;

  return (
    <button onClick={handleWalletLogin} disabled={loading}>
      {loading ? 'Вход...' : 'Login with Wallet'}
    </button>
  );
}
