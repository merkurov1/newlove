"use client";

import { usePrivy } from '@privy-io/react-auth';
import { useState } from 'react';

export default function WalletLoginButton() {
  const { login, ready, authenticated, getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);

  const handleWalletLogin = async () => {
    setLoading(true);
    try {
      await login();
      const authToken = await getAccessToken();
      // Отправляем токен на бэкенд
      const res = await fetch('/api/privy-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert('Ошибка входа через кошелек: ' + (data.error || 'Unknown error') + '\n' + (data.debug ? JSON.stringify(data.debug, null, 2) : ''));
        return;
      }
      // Устанавливаем сессию Supabase
      const { access_token, refresh_token } = data;
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      await supabase.auth.setSession({ access_token, refresh_token });
      window.location.reload();
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
