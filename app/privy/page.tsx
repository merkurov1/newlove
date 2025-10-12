
"use client";
import { usePrivyAuth } from '@/hooks/usePrivyAuth';

  const { login, ready, authenticated, isLoading, error, session, status, debug } = usePrivyAuth();

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 24, border: '1px solid #eee', borderRadius: 12 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Privy Debug</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Кнопка ниже выполняет полный цикл: login через Privy, запрос к /api/privy-auth, затем signIn('privy') через NextAuth.<br />
        <b>Все debug-данные и ошибки будут выведены ниже.</b>
      </p>
      <button onClick={login} disabled={isLoading || !ready || authenticated} style={{ marginBottom: 24 }}>
        {isLoading ? 'Вход...' : 'Login with Wallet (debug)'}
      </button>
      {error && <div style={{ color: 'red', marginBottom: 16 }}>Ошибка: {error}</div>}
      <div style={{ fontSize: 13, color: '#333', background: '#f8f8f8', padding: 12, borderRadius: 8, marginTop: 8 }}>
        <b>Session status:</b> {status}<br />
        <b>Session:</b> <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(session, null, 2)}</pre>
        <b>Cookies:</b> <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{typeof document !== 'undefined' ? document.cookie : ''}</pre>
        {debug ? <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(debug, null, 2)}</pre> : <div style={{ color: '#888', marginTop: 8 }}>Нет debug-данных. Нажмите кнопку выше для отладки Privy.</div>}
      </div>
      <div style={{ marginTop: 40, color: '#888', fontSize: 14 }}>
        <b>Debug env:</b><br />
        PRIVY_APP_ID: {process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'not set'}<br />
        NODE_ENV: {process.env.NODE_ENV}<br />
      </div>
    </div>
  );
}
