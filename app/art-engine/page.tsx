import { Suspense } from 'react';
import ArtEngineClient from './ArtEngineClient';

export const metadata = {
  title: 'Art Engine // Intelligence Terminal — Anton Merkurov',
  description: 'Institutional-grade art acquisition, liquidity analysis, and curatorial dossier synthesis.',
};

export default function ArtEnginePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center font-mono text-xs uppercase tracking-widest text-gray-400">
          Loading Terminal...
        </div>
      }
    >
      <ArtEngineClient />
    </Suspense>
  );
}
