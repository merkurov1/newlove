// app/wallet/page.tsx// Файл удалён для устранения ошибки сборки.

'use client';
import { WalletProvider } from '@/components/wallet/WalletProvider';
import { WalletConnectButton } from '@/components/wallet/WalletConnectButton';
import { WalletStatus } from '@/components/wallet/WalletStatus';
import { useAccount, useSignMessage } from 'wagmi';
import { useState } from 'react';
import { createSiweMessage } from '@/lib/wallet/siwe';
import { supabase } from '@/lib/wallet/supabase-wallet';

export default function WalletPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  async function handleSiweLogin() {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      // 1. Получить nonce
      const nonceRes = await fetch('/api/wallet/nonce', {
        method: 'POST',
        body: JSON.stringify({ wallet_address: address || '' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const { nonce, error: nonceError } = await nonceRes.json();
      if (!nonce || nonceError) throw new Error(nonceError || 'Ошибка получения nonce');

      // 2. Сгенерировать SIWE message
      const siweMessage = createSiweMessage({
        address: address || '',
        chainId: 1, // для Ethereum, для других сетей подставить нужный chainId
        domain: window.location.host,
        uri: window.location.origin,
        statement: 'Вход через Ethereum',
        nonce,
      });
      const message = siweMessage.prepareMessage();

      // 3. Подписать
      const signature = await signMessageAsync({ message });

      // 4. Отправить на верификацию
      const verifyRes = await fetch('/api/wallet/verify', {
        method: 'POST',
        body: JSON.stringify({ message, signature, chain: 'ethereum' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyJson.error || 'Ошибка верификации');
      setUser(verifyJson.user);
      setStatus('Успешный вход через кошелёк!');
    } catch (err: any) {
      setError(err.message || 'Ошибка SIWE авторизации');
    } finally {
      setLoading(false);
    }
  }

  return (
    <WalletProvider>
      <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded-xl shadow-lg flex flex-col items-center">
        <h1 className="text-2xl font-bold mb-4">Вход через криптокошелёк</h1>
        <WalletConnectButton />
        <WalletStatus />
        {isConnected && !user && (
          <button
            onClick={handleSiweLogin}
            className="mt-4 px-6 py-3 rounded bg-green-600 text-white font-semibold hover:bg-green-700"
            disabled={loading}
          >
            {loading ? 'Вход...' : 'Войти через SIWE'}
          </button>
        )}
        {status && <div className="mt-4 text-green-600">{status}</div>}
        {error && <div className="mt-4 text-red-600">{error}</div>}
        {user && (
          <div className="mt-4 text-sm text-gray-700">Добро пожаловать, {user.wallet_address}</div>
        )}
      </div>
    </WalletProvider>
  );
}
