"use client";

import { PrivyProvider } from '@privy-io/react-auth';
import { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: 'light',
        },
        loginMethods: ['wallet', 'email', 'google'],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        oauthProviders: ['google'],
        onSuccess: () => {}, // Без редиректов, всё управляется вручную
      }}
    >
      {children}
    </PrivyProvider>
  );
}
