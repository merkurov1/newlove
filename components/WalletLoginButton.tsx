'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Wallet } from 'lucide-react';

export default function WalletAuthButton({ onAuthenticated }: { onAuthenticated?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleWalletLogin = async () => {
    setError(null);
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      setError('Web3 wallet not detected (e.g. MetaMask)');
      return;
    }

    setLoading(true);
    try {
      const ethersMod = await import('ethers');
      const { ethers } = ethersMod as any;

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      // Формируем сообщение для подписи (SIWE standard)
      const domain = window.location.host;
      const statement = 'Sign in to Merkurov Private Sanctuary';
      const issuedAt = new Date().toISOString();
      const message = `${domain} wants you to sign in with your Ethereum account:\n${address}\n\n${statement}\n\nIssued At: ${issuedAt}`;

      const signature = await signer.signMessage(message);

      // Отправляем на бэкенд для проверки и создания сессии Supabase
      const res = await fetch('/api/auth/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, message, signature }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      // Если бэкенд вернул токены сессии Supabase, устанавливаем их
      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      if (onAuthenticated) {
        onAuthenticated();
      } else {
        window.location.href = '/art-engine';
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Wallet authentication error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full space-y-2">
      <button
        type="button"
        onClick={handleWalletLogin}
        disabled={loading}
        className="w-full py-4 px-6 rounded-full bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-900 font-mono text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-sm cursor-pointer disabled:opacity-50"
      >
        <Wallet size={16} className="text-zinc-700" />
        <span>{loading ? 'Signing message...' : 'Continue with Web3 Wallet'}</span>
      </button>
      {error && (
        <div className="text-[10px] font-mono text-rose-600 text-center uppercase tracking-wider">
          {error}
        </div>
      )}
    </div>
  );
}
