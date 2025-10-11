"use client";

import { useState } from "react";
import { ThirdwebProvider, metamaskWallet, walletConnect, coinbaseWallet, useConnect, useDisconnect, useAddress } from "@thirdweb-dev/react";
import { signIn } from 'next-auth/react';

// Для Next.js 14 (app router) ThirdwebProvider должен быть client component
// Ключи должны быть прописаны в .env.local:
// NEXT_PUBLIC_THIRDWEB_CLIENT_ID=62671905e91d5d8fa6f42c8fbf47bcc7
// THIRDWEB_SECRET_KEY=Fn09jrWzIp149o6wAGzV363zcmYvmCMkwY57wxwFsDiwZTs9rDwA2l5j024UZgAkT_hJHU2UV7xXENhGVyBPKg

const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;

export default function W3AuthPage() {
  return (
    <ThirdwebProvider
      supportedWallets={[metamaskWallet(), walletConnect(), coinbaseWallet()]}
      activeChain="ethereum"
      clientId={clientId}
    >
      <W3AuthInner />
    </ThirdwebProvider>
  );
}

function W3AuthInner() {
  const connect = useConnect();
  const disconnect = useDisconnect();
  const address = useAddress();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState<any>(null);

  // После подключения кошелька — signIn через next-auth
  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!address) throw new Error('Wallet not connected');
      // Можно добавить подпись сообщения для подтверждения владения (по желанию)
      const res = await signIn('privy', {
        accessToken: address,
        redirect: false,
      });
      setDebug(res);
      if (res?.ok) {
        window.location.reload();
      } else {
        setError(res?.error || 'Auth error');
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "40px auto", padding: 24, border: "1px solid #eee", borderRadius: 12 }}>
      <h2>Thirdweb Auth Demo</h2>
      <div style={{ margin: "16px 0" }}>
        {address ? (
          <>
            <div>Connected wallet: <b>{address}</b></div>
            <button onClick={disconnect} style={{ marginTop: 12 }}>Logout</button>
            <button onClick={handleSignIn} style={{ marginTop: 12 }} disabled={loading}>
              {loading ? 'Вход...' : 'Войти через кошелек'}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => connect(metamaskWallet())} style={{ marginRight: 8 }}>MetaMask</button>
            <button onClick={() => connect(walletConnect())} style={{ marginRight: 8 }}>WalletConnect</button>
            <button onClick={() => connect(coinbaseWallet())}>Coinbase</button>
          </>
        )}
      </div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {debug && <pre style={{ fontSize: 12, color: '#888', marginTop: 8 }}>{JSON.stringify(debug, null, 2)}</pre>}
    </div>
  );
}
