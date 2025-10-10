import dynamic from 'next/dynamic';

const Login = dynamic(() => import('@/components/Login'), { ssr: false });
const WalletLoginButton = dynamic(() => import('@/components/WalletLoginButton'), { ssr: false });

export default function PrivyDebugPage() {
  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 24, border: '1px solid #eee', borderRadius: 12 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Privy Debug</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Здесь можно протестировать оба варианта логина через Privy и посмотреть полный ответ backend.<br />
        <b>authToken</b> и ответ API будут выведены на экран.
      </p>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Login (authToken → /api/privy-auth)</h2>
        <Login />
      </div>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>WalletLoginButton (прямая интеграция)</h2>
        <WalletLoginButton />
      </div>
      <div style={{ marginTop: 40, color: '#888', fontSize: 14 }}>
        <b>Debug env:</b><br />
        PRIVY_APP_ID: {process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'not set'}<br />
        NODE_ENV: {process.env.NODE_ENV}<br />
      </div>
    </div>
  );
}
