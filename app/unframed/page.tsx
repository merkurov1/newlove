"use client";

import React, { useRef, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { Terminal } from 'lucide-react';

const UnframedTunnel = dynamic(() => import('@/components/unframed/UnframedTunnel'), { ssr: false, loading: () => <div className="fixed inset-0 z-30" /> });


// --- Assets ---
const ASSETS = {
  HERO_BG:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1055.png',
  SYSTEM_MAP:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1054.png',
  TIGER:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg',
  AUDIO:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Digitize_the_Death_Mask_Encrypt_Freedom_Never.m4a',
};

// Timeline data (Artist Arc)
const TIMELINE = [
  { year: '1984', title: 'The Floor', text: "I am four years old. The sun cuts through the tall Stalinist windows. I am drawing." },
  { year: '1998', title: 'The Rooftops', text: 'We drilled through walls, running coaxial cables with frozen hands. We built the infrastructure of freedom.' },
  { year: '2003', title: 'The Glass Cage', text: 'A city that kept walking. Silence louder than the noise.' },
  { year: '2008', title: 'The Spectral Tiger', text: 'Digital value doesn’t need banks. It only needs Consensus.' , image: ASSETS.TIGER},
  { year: '2017', title: 'The Source Code', text: 'We scanned the idol and turned stone into a file.' },
  { year: '2022', title: 'The Silence', text: 'The city adjusted its headphones and kept walking.' , image: ASSETS.HERO_BG},
  { year: '2025', title: 'The Canvas', text: 'The loop closed. I shut the door on the noise. I picked up the stylus. I am finally awake.' },
];

// 3D rendering moved into a client-only dynamically loaded component `UnframedTunnel`.

// --- Page UI ---
export default function UnframedPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  // Surface runtime errors to avoid white screen — useful during debugging
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      setRuntimeError(`${ev.message} @ ${ev.filename}:${ev.lineno}:${ev.colno}`);
      return false;
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      try {
        const reason = ev.reason instanceof Error ? ev.reason.stack || ev.reason.message : String(ev.reason);
        setRuntimeError(`UnhandledRejection: ${reason}`);
      } catch (e) {
        setRuntimeError('UnhandledRejection');
      }
    };
    window.addEventListener('error', onError as unknown as EventListener);
    window.addEventListener('unhandledrejection', onRejection as unknown as EventListener);
    return () => {
      window.removeEventListener('error', onError as unknown as EventListener);
      window.removeEventListener('unhandledrejection', onRejection as unknown as EventListener);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1200);
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 overflow-hidden antialiased">

      {/* Runtime error overlay (visible when a runtime error occurs) */}
      {runtimeError && (
        <div className="fixed inset-0 z-[9999] bg-black/90 text-red-300 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto font-mono text-sm whitespace-pre-wrap">
            <strong className="block text-lg mb-4">Runtime Error (debug):</strong>
            <pre className="whitespace-pre-wrap">{runtimeError}</pre>
          </div>
        </div>
      )}

      {/* MASSIVE FIXED HEADER */}
      <header className="fixed inset-0 z-50 pointer-events-none flex items-start justify-center">
        <div className="mt-12 text-center">
          <h1 className="text-[18vw] leading-[0.7] font-extrabold uppercase mix-blend-difference select-none" style={{ fontFamily: 'serif' }}>
            UNFRAMED
          </h1>
          <div className="mt-2 font-mono text-xs uppercase tracking-widest text-zinc-300">A MEMOIR BY ANTON MERKUROV</div>
        </div>
      </header>

      {/* 3D Scroll Tunnel (client-only, dynamically loaded) */}
      <section className="relative h-screen w-full">
        <UnframedTunnel />
      </section>

      {/* AFTER TUNNEL: NotebookLM + Request Form (static sections) */}
      <main className="relative z-40 bg-black px-6 md:px-20 py-24">
        <section className="max-w-6xl mx-auto mb-20">
          <div className="font-mono text-xs text-red-600 uppercase tracking-widest mb-4">03 / AI Analysis</div>
          <h3 className="text-4xl font-bold text-white mb-4">The Autopsy of an Empire</h3>
          <p className="text-lg text-zinc-400 font-serif leading-relaxed">Two synthetic hosts analyze the shift from the heavy Granite to the weightless Ether. NotebookLM generated insights and timestamps accompany the dossier.</p>

          <div className="mt-8 p-6 border border-zinc-800 bg-black/40">
            <audio controls className="w-full h-10">
              <source src={ASSETS.AUDIO} type="audio/mp4" />
            </audio>
          </div>
        </section>

        <section className="max-w-3xl mx-auto bg-[#050505] border border-zinc-900 p-8">
          <div className="flex items-center gap-3 mb-6">
            <Terminal className="text-red-500" />
            <div className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Secure Transmission</div>
          </div>

          {status === 'success' ? (
            <div className="p-6 bg-green-900/10 border border-green-900/30 text-green-400 font-mono">Signal received. Awaiting confirmation.</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="font-mono text-xs text-zinc-400">NAME</label>
                <input className="w-full mt-2 bg-black border border-zinc-800 p-3 text-white" required />
              </div>
              <div>
                <label className="font-mono text-xs text-zinc-400">EMAIL</label>
                <input type="email" className="w-full mt-2 bg-black border border-zinc-800 p-3 text-white" required />
              </div>
              <button className="w-full bg-red-600 text-black font-bold py-3">Initialize Request</button>
            </form>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="z-40 relative text-center py-8 font-mono text-xs text-zinc-600">MERKUROV.LOVE / UNFRAMED © 2025</footer>
    </div>
  );
}