// components/wallet/WalletStatus.tsx
'use client';
import { useAccount, useChainId, useChains } from 'wagmi';

export function WalletStatus() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const chains = useChains();
  const chain = chains.find((c) => c.id === chainId);

  if (!isConnected) return null;

  return (
    <div className="flex flex-col items-center gap-1 mt-2">
      <div className="text-xs text-gray-500">Сеть: <b>{chain?.name}</b></div>
      <div className="text-xs text-gray-500">Адрес: <b>{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''}</b></div>
    </div>
  );
}
