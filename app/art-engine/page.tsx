import React from 'react';
import ArtEngineClient from './ArtEngineClient';

export const metadata = {
  title: 'Art Engine // Intelligence Terminal — Anton Merkurov',
  description: 'Institutional-grade art acquisition, liquidity analysis, and curatorial dossier synthesis.',
  openGraph: {
    title: 'Art Engine // Intelligence Terminal — Anton Merkurov',
    description: 'Institutional-grade art acquisition, liquidity analysis, and curatorial dossier synthesis.',
    url: 'https://merkurov.love/art-engine',
    siteName: 'Anton Merkurov',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Art Engine // Intelligence Terminal — Anton Merkurov',
    description: 'Institutional-grade art acquisition, liquidity analysis, and curatorial dossier synthesis.',
  },
};

export default function ArtEnginePage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center font-mono text-xs uppercase tracking-widest text-gray-400">
          Initializing Terminal...
        </div>
      }
    >
      <ArtEngineClient />
    </React.Suspense>
  );
}
