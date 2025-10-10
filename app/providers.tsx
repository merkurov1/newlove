"use client";

import { PrivyProvider } from '@privy-io/react-auth';
import { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId="cmgkx5d51009bie0bsccdy86f"
      config={{
        appearance: {
          theme: 'light',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
