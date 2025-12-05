"use client";

import React, { useEffect, useState } from 'react';
import GlitchCanvasFallback from './GlitchCanvasFallback';
import TIMELINE from '@/lib/unframedTimeline';
import Image from 'next/image';

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
    <>
      <div className="fixed inset-0 z-30">
        <GlitchCanvasFallback />
        {error && (
          <div className="absolute bottom-4 right-4 p-2 bg-black/70 text-xs text-red-300 font-mono">Tunnel load failed</div>
        )}
      </div>

      {/* Server-rendered HTML overlay so timeline/content remains visible when client tunnel fails */}
      <div className="relative z-40">
        <div className="container mx-auto px-6 md:px-12">
          {TIMELINE.map((item, i) => (
            <section key={item.year} className="min-h-screen flex items-center" style={{ display: 'flex', alignItems: 'center' }}>
              <div className="max-w-3xl mx-auto">
                <div className="font-mono text-xs text-red-600 uppercase tracking-widest mb-4">{`0${i + 1} / ${item.year}`}</div>
                <h2 className="text-4xl md:text-6xl font-serif text-white mb-6">{item.title}</h2>
                <p className="text-xl md:text-2xl text-zinc-300 font-serif leading-relaxed">{item.text}</p>
                {item.image && (
                  <div className="mt-8 w-full max-w-2xl relative overflow-hidden">
                    <Image src={item.image} alt={item.title} width={1200} height={700} className="object-cover grayscale transition-all duration-500 hover:filter-none" />
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
