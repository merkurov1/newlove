"use client";

import React, { useEffect, useState } from 'react';
import GlitchCanvasFallback from './GlitchCanvasFallback';

export default function UnframedTunnel() {
  const [Comp, setComp] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const m = await import('./UnframedTunnelClient');
        if (!mounted) return;
        setComp(() => (m && m.default) ? m.default : null);
      } catch (e: any) {
        console.error('UnframedTunnel: failed to load client implementation', e);
        const msg = String(e?.message || e);
        setError(msg);
        try {
          const ev = new CustomEvent('unframed:loadError', { detail: { message: msg, stack: e?.stack } });
          window.dispatchEvent(ev);
        } catch (err) {
          // ignore dispatch errors
        }
      }
    }

    load();
    return () => { mounted = false; };
  }, []);

  if (Comp) {
    const C = Comp as React.ComponentType;
    return <C />;
  }

  // Render fallback canvas on error or while loading
  return (
    <div className="fixed inset-0 z-30">
      <GlitchCanvasFallback />
      {error && (
        <div className="absolute bottom-4 right-4 p-2 bg-black/70 text-xs text-red-300 font-mono">Tunnel load failed</div>
      )}
    </div>
  );
}
