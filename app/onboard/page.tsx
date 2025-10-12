"use client";
import { useState } from "react";
import Onboard from '@web3-onboard/core';
import injectedModule from '@web3-onboard/injected-wallets';
import walletConnectModule from '@web3-onboard/walletconnect';
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function OnboardLoginPage() {
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleOnboardWeb3Login = async () => {
    setLoading(true);
    setError("");
    try {
      const walletConnect = walletConnectModule({
        projectId: '0083c29479d8ea22af3a3a44a447c439',
        requiredChains: [1],
      });
      const injected = injectedModule();
      const onboard = Onboard({
        wallets: [injected, walletConnect],
        chains: [
          {
            id: '0x1',
            token: 'ETH',
            label: 'Ethereum Mainnet',
            rpcUrl: 'https://mainnet.infura.io/v3/0083c29479d8ea22af3a3a44a447c439',
          },
        ],
        appMetadata: {
          name: 'newlove DApp',
          icon: '<svg></svg>',
          description: 'Авторизация через крипто-кошелек',
        },
      });
      const wallets = await onboard.connectWallet();
      if (!wallets[0]) {
        setError('Кошелек не подключен');
        setLoading(false);
        return;
      }
      const wallet = wallets[0];
    const address = wallet.accounts[0].address;
    const ethersProvider = new ethers.BrowserProvider(wallet.provider, 'any');
    const signer = await ethersProvider.getSigner();
    // Формируем SIWE message по стандарту EIP-4361 (6+ строк, все обязательные поля)
    const domain = window.location.host;
      // Поддержка двух разрешённых URI
      const allowedUris = ["https://www.merkurov.love", "https://merkurov.love"];
      let uri = window.location.origin;
      if (!allowedUris.includes(uri)) {
        uri = allowedUris[0]; // fallback на основной
      }
    const version = '1';
    const chainId = '1';
    const nonce = Math.floor(Math.random() * 1e16).toString();
    const issuedAt = new Date().toISOString();
    const statement = 'Sign in with Ethereum to the app.';
    const message = `${domain} wants you to sign in with your Ethereum account:\n${address}\n\n${statement}\n\nURI: ${uri}\nVersion: ${version}\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
    const signature = await signer.signMessage(message);
      const { data, error } = await supabase.auth.signInWithWeb3({
        chain: 'ethereum',
        message,
        signature: signature as any,
      });
      if (error) setError(error.message);
      else setUser(data.user);
    } catch (e: any) {
      setError(e.message || String(e));
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 400, margin: "40px auto", padding: 24, border: "1px solid #eee", borderRadius: 12 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Onboard Web3 Login</h1>
      <button onClick={handleOnboardWeb3Login} disabled={loading} style={{ width: "100%", padding: 12, fontSize: 18, background: "#00B386", color: "#fff", border: "none", borderRadius: 8 }}>
        {loading ? "Вход через Onboard..." : "Войти через Onboard (Web3)"}
      </button>
      <a href="/onboard/secret/" target="_blank" rel="noopener noreferrer" style={{ display: 'block', margin: '16px 0', color: '#2979FF', textAlign: 'center', textDecoration: 'underline', fontWeight: 600 }}>
        Перейти к /onboard/secret/ (тест в приватной вкладке)
      </a>
      {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}
      {user && (
        <pre style={{ marginTop: 24, background: "#f8f8f8", padding: 12, borderRadius: 8 }}>{JSON.stringify(user, null, 2)}</pre>
      )}
    </div>
  );
}
