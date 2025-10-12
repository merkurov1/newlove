import Onboard from '@web3-onboard/core';
import injectedModule from '@web3-onboard/injected-wallets';
import walletConnectModule from '@web3-onboard/walletconnect';
import { ethers } from 'ethers';
// Инициализация Web3-Onboard (один раз на клиенте)
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
  // Вход через Web3-Onboard (SIWE)
  async function handleOnboardWeb3Login() {
    setLoading(true);
    setError("");
    try {
      // 1. Подключаем кошелек
      const wallets = await onboard.connectWallet();
      if (!wallets[0]) {
        setError('Кошелек не подключен');
        setLoading(false);
        return;
      }
      const wallet = wallets[0];
      const address = wallet.accounts[0].address;
      // 2. Создаем ethers-провайдер и signer
      const ethersProvider = new ethers.BrowserProvider(wallet.provider, 'any');
      const signer = await ethersProvider.getSigner();
      // 3. Генерируем nonce (можно заменить на вызов Supabase Edge Function)
      const nonce = Math.floor(Math.random() * 1e16).toString();
      // 4. Формируем сообщение для подписи (EIP-4361)
      const message = `\nВход в newlove!\n\nПодпишите это сообщение для входа.\n\nАдрес: ${address}\nNonce: ${nonce}`;
      // 5. Подпись
      const signature = await signer.signMessage(message);
      // 6. Вход через Supabase Web3
      // @ts-ignore
      const { data, error } = await supabase.auth.signInWithWeb3({
        message,
        signature,
        address,
        nonce,
      });
      if (error) setError(error.message);
      else setUser(data.user);
    } catch (e: any) {
      setError(e.message || String(e));
    }
    setLoading(false);
  }
"use client";
import { useState } from "react";
import { createClient } from '@supabase/supabase-js';
import { signIn } from 'next-auth/react';
import { ethers } from 'ethers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function SupabaseAuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    else setUser(data.user);
    setLoading(false);
  }

  async function handleSignIn() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setUser(data.user);
    // Синхронизируем сессию NextAuth (если есть CredentialsProvider для email)
    try {
      await signIn('credentials', { email, password, redirect: false });
    } catch (e) {
      // ignore
    }
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  // Проверка сессии
  async function checkSession() {
    const { data } = await supabase.auth.getSession();
    setUser(data.session?.user || null);
  }

  // Вход через Google
  async function handleGoogleSignIn() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) setError(error.message);
    setLoading(false);
  }

  // Вход через Web3 (универсальный Web3/FIDO2)
  async function handleWeb3SignIn() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'web3' as any });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 400, margin: "40px auto", padding: 24, border: "1px solid #eee", borderRadius: 12 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Supabase Auth</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 8, fontSize: 16 }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 16, fontSize: 16 }}
      />
      <button onClick={handleSignUp} disabled={loading || !email || !password} style={{ width: "100%", padding: 10, marginBottom: 8 }}>
        {loading ? "Регистрация..." : "Зарегистрироваться"}
      </button>
      <button onClick={handleSignIn} disabled={loading || !email || !password} style={{ width: "100%", padding: 10, marginBottom: 8 }}>
        {loading ? "Вход..." : "Войти"}
      </button>
      <button onClick={handleGoogleSignIn} disabled={loading} style={{ width: "100%", padding: 10, marginBottom: 8, background: '#4285F4', color: '#fff', fontWeight: 600 }}>
        {loading ? "Вход через Google..." : "Войти через Google"}
      </button>
      <button onClick={handleWeb3SignIn} disabled={loading} style={{ width: "100%", padding: 10, marginBottom: 8, background: '#222', color: '#fff', fontWeight: 600 }}>
        {loading ? "Вход через Web3..." : "Войти через Web3 (универсальный)"}
      </button>
      <button onClick={handleOnboardWeb3Login} disabled={loading} style={{ width: "100%", padding: 10, marginBottom: 8, background: '#00B386', color: '#fff', fontWeight: 600 }}>
        {loading ? "Вход через Onboard/Web3..." : "Войти через Onboard (Web3)"}
      </button>
      <a href="/sb/secret/" target="_blank" rel="noopener noreferrer" style={{ display: 'block', margin: '16px 0', color: '#2979FF', textAlign: 'center', textDecoration: 'underline', fontWeight: 600 }}>
        Перейти к /sb/secret/ (тест в приватной вкладке)
      </a>
      <button onClick={checkSession} style={{ width: "100%", padding: 10, marginBottom: 8 }}>
        Проверить сессию
      </button>
      {user && (
        <>
          <div style={{ margin: '16px 0', color: '#2a2' }}>Вы вошли как: {user.email || user.id}</div>
          <button onClick={handleSignOut} style={{ width: "100%", padding: 10, background: '#eee' }}>Выйти</button>
          <div style={{ marginTop: 16, fontSize: 13, color: '#333', background: '#f8f8f8', padding: 12, borderRadius: 8 }}>
            <b>user:</b> <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(user, null, 2)}</pre>
          </div>
          <div style={{ marginTop: 16, color: '#2a2', fontWeight: 600 }}>Доступ к закрытым разделам разрешён!</div>
        </>
      )}
      {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}
    </div>
  );
}
