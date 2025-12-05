import dynamic from 'next/dynamic';
import React from 'react';

const UnframedTunnelClient = dynamic(() => import('./UnframedTunnelClient'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-full bg-black flex items-center justify-center text-zinc-500 font-mono">INITIALIZING SYSTEM...</div>
  ),
});

export default function UnframedTunnel() {
  return <UnframedTunnelClient />;
}