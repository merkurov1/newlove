// components/wallet/WalletConnectButton.tsx
'use client';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useWeb3Modal } from '@web3modal/wagmi/react';
import { useState } from 'react';

export function WalletConnectButton() {
  const { address, isConnected } = useAccount();
  const { open } = useWeb3Modal();
  const { disconnect } = useDisconnect();
  const [loading, setLoading] = useState(false);

  if (isConnected) {
    return (
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm text-gray-700">Кошелёк: <b>{address?.slice(0, 6)}...{address?.slice(-4)}</b></span>
        <button onClick={() => disconnect()} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">Отключить</button>
      </div>
    );
  }

  return (
    <button
      onClick={() => open()}
      className="px-6 py-3 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700"
      disabled={loading}
    >
      {loading ? 'Подключение...' : 'Подключить кошелёк'}
    </button>
  );
}
