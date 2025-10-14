"use client";
import { useState } from "react";
import { createClient as createBrowserClient } from '@/lib/supabase-browser';
import Onboard from '@web3-onboard/core';
import injectedModule from '@web3-onboard/injected-wallets';
import walletConnectModule from '@web3-onboard/walletconnect';
import { ethers } from 'ethers';
const supabase = createBrowserClient();

export default function ModernLoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleGoogle = async () => {
    setLoading("google");
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
    if (error) setError(error.message);
    setLoading(null);
  };


  const handleOnboardWeb3Login = async () => {
    setLoading("web3");
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
        setLoading(null);
        return;
      }
      const wallet = wallets[0];
      const address = wallet.accounts[0].address;
      const ethersProvider = new ethers.BrowserProvider(wallet.provider, 'any');
      const signer = await ethersProvider.getSigner();
      const domain = window.location.host;
      const uri = "https://www.merkurov.love";
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
      else if (typeof onClose === 'function') onClose(); // Закрыть модалку после успешного входа
    } catch (e) {
      setError((e as any).message || String(e));
    }
    setLoading(null);
  };

  const handleEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading("email");
    setError(null);
    const form = e.target as HTMLFormElement;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) setError(error.message);
    setLoading(null);
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, minWidth: 340, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 24, right: 32, fontSize: 24, background: "none", border: "none", cursor: "pointer" }}>&times;</button>
        <h2 style={{ textAlign: "center", fontSize: 28, marginBottom: 24 }}>Вход в аккаунт</h2>
        <button onClick={handleGoogle} disabled={loading === "google"} style={{ width: "100%", padding: 14, marginBottom: 12, background: "#4285F4", color: "#fff", fontWeight: 600, border: 0, borderRadius: 8, fontSize: 18 }}>
          {loading === "google" ? "Вход через Google..." : "Войти через Google"}
        </button>
        <button
          onClick={handleOnboardWeb3Login}
          disabled={loading === "web3"}
          style={{
            width: '100%',
            padding: 14,
            marginBottom: 12,
            background: '#222',
            color: '#fff',
            fontWeight: 600,
            border: 0,
            borderRadius: 8,
            fontSize: 18,
            textAlign: 'center',
            cursor: 'pointer'
          }}
        >
          {loading === "web3" ? "Вход через Web3..." : "Войти через Web3"}
        </button>
        <form onSubmit={handleEmail} style={{ marginTop: 12 }}>
          <input name="email" type="email" placeholder="Email" required style={{ width: "100%", padding: 12, fontSize: 16, borderRadius: 8, border: "1px solid #ddd", marginBottom: 8 }} />
          <button type="submit" disabled={loading === "email"} style={{ width: "100%", padding: 12, background: "#00B386", color: "#fff", fontWeight: 600, border: 0, borderRadius: 8, fontSize: 18 }}>
            {loading === "email" ? "Отправка ссылки..." : "Войти по email"}
          </button>
        </form>
        {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}
      </div>
    </div>
  );
}
