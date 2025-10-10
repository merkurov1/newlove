// components/wallet/WalletProvider.tsx
'use client';
import { ReactNode } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet, polygon, optimism, arbitrum } from '@wagmi/core/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { coinbaseWallet, metaMask, walletConnect } from '@wagmi/connectors';
import { EthereumClient, w3mConnectors, w3mProvider } from '@web3modal/ethereum';

const chains = [mainnet, polygon, optimism, arbitrum];
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!;

const wagmiConfig = createConfig({
  chains: chains as unknown as readonly [any, ...any[]],
  connectors: w3mConnectors({ projectId, chains }),
  transports: chains.reduce((acc, chain) => {
    acc[chain.id] = http(w3mProvider({ projectId })(chain));
    return acc;
  }, {} as Record<number, ReturnType<typeof http>>),
});

const ethereumClient = new EthereumClient(wagmiConfig, chains);
const queryClient = new QueryClient();

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
  {children}
  {/* Web3Modal UI is handled via useWeb3Modal hook/button, not as a component here */}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
