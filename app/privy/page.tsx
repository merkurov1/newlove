"use client";
import { usePrivy } from '@privy-io/react-auth';
import { useSession, signIn } from 'next-auth/react';
import { useState } from 'react';

export default function PrivyDebugPage() {
  const { login, ready, authenticated, getAccessToken } = usePrivy();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleWalletLogin = async () => {
    setLoading(true);
    setError(null);
    setDebug(null);
    try {
      await login();
      const authToken = await getAccessToken();
      // Выводим authToken в debug до отправки
      let privyData = null;
      let signInRes = null;
      try {
        const privyRes = await fetch('/api/privy-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authToken }),
        });
        privyData = await privyRes.json();
      } catch (e) {
        privyData = { error: 'fetch failed', details: String(e) };
      }
      try {
        signInRes = await signIn('privy', {
          authToken,
          redirect: false,
          callbackUrl: '/',
        });
      } catch (e) {
        signInRes = { error: 'signIn failed', details: String(e) };
      }
      setDebug({
        authToken,
        privyAuth: privyData,
        signInRes,
        session,
        status,
        cookies: typeof document !== 'undefined' ? document.cookie : '',
      });
      // window.location.reload(); // не делаем reload для отладки
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 24, border: '1px solid #eee', borderRadius: 12 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Privy Debug</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Кнопка ниже выполняет полный цикл: login через Privy, запрос к /api/privy-auth, затем signIn('privy') через NextAuth.<br />
        <b>Все debug-данные и ошибки будут выведены ниже.</b>
      </p>
      <button onClick={handleWalletLogin} disabled={loading || !ready || authenticated} style={{ marginBottom: 24 }}>
        {loading ? 'Вход...' : 'Login with Wallet (debug)'}
      </button>
      <button onClick={() => setDebug(null)} style={{ marginLeft: 8, marginBottom: 24 }}>
        Показать только session/cookies
      </button>
      {error && <div style={{ color: 'red', marginBottom: 16 }}>Ошибка: {error}</div>}
      <div style={{ fontSize: 13, color: '#333', background: '#f8f8f8', padding: 12, borderRadius: 8, marginTop: 8 }}>
        <b>Session status:</b> {status}<br />
        <b>Session:</b> <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(session, null, 2)}</pre>
        <b>Cookies:</b> <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{typeof document !== 'undefined' ? document.cookie : ''}</pre>
        {debug ? <>
          <b>authToken (client):</b> <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(debug.authToken, null, 2)}</pre>
          <b>signIn('privy') result:</b> <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(debug.signInRes, null, 2)}</pre>
          <b>/api/privy-auth response:</b> <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(debug.privyAuth, null, 2)}</pre>
        </> : <div style={{ color: '#888', marginTop: 8 }}>Нет debug-данных. Нажмите кнопку выше для отладки Privy.</div>}
      </div>
      <div style={{ marginTop: 40, color: '#888', fontSize: 14 }}>
        <b>Debug env:</b><br />
        PRIVY_APP_ID: {process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'not set'}<br />
        NODE_ENV: {process.env.NODE_ENV}<br />
      </div>
    </div>
  );
}
