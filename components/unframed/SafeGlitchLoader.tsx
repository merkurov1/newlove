"use client";

import React, { useEffect, useState } from 'react';

type LoaderError = { phase: string; message?: string; stack?: string } | null;

export default function SafeGlitchLoader({ onError }: { onError?: (err: LoaderError) => void } = {}) {
  const [Comp, setComp] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<LoaderError>(null);

  useEffect(() => {
    let mounted = true;

    async function tryLoad() {
      try {
        // Step 1: try loading three
        await import('three');
      } catch (e: any) {
        if (!mounted) return;
        console.error('SafeGlitchLoader: failed to import three', e);
        const err = { phase: 'three', message: String(e?.message || e), stack: e?.stack } as LoaderError;
        setError(err);
        onError?.(err);
        return;
      }
      // Try to import r3f and drei but don't abort on failure — we'll fall back
      let missingR3F = false;
      let missingDrei = false;
      try {
        await import('@react-three/fiber');
      } catch (e: any) {
        console.warn('SafeGlitchLoader: @react-three/fiber not available, will use fallback', e);
        missingR3F = true;
        onError?.({ phase: '@react-three/fiber', message: String(e?.message || e), stack: e?.stack });
      }

      try {
        await import('@react-three/drei');
      } catch (e: any) {
        console.warn('SafeGlitchLoader: @react-three/drei not available, will use fallback', e);
        missingDrei = true;
        onError?.({ phase: '@react-three/drei', message: String(e?.message || e), stack: e?.stack });
      }

      // Finally, try to load the app component — if r3f is missing use fallback
      if (!missingR3F) {
        try {
          const m = await import('@/components/unframed/GlitchCanvas');
          if (!mounted) return;
          setComp(() => (m && m.default) ? m.default : null);
          return;
        } catch (e: any) {
          console.warn('SafeGlitchLoader: failed to import GlitchCanvas, will attempt fallback', e);
          onError?.({ phase: 'GlitchCanvas', message: String(e?.message || e), stack: e?.stack });
        }
      }

      // Load fallback component implemented with plain three.js
      try {
        const fb = await import('@/components/unframed/GlitchCanvasFallback');
        if (!mounted) return;
        setComp(() => (fb && fb.default) ? fb.default : null);
      } catch (e: any) {
        if (!mounted) return;
        console.error('SafeGlitchLoader: failed to import fallback GlitchCanvasFallback', e);
        const err = { phase: 'GlitchCanvasFallback', message: String(e?.message || e), stack: e?.stack } as LoaderError;
        setError(err);
        onError?.(err);
      }
    }

    tryLoad();
    return () => { mounted = false; };
  }, []);

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400">
        <div className="font-semibold mb-2">Module load error: {error.phase}</div>
        <pre className="whitespace-pre-wrap text-xs font-mono">{error.message}</pre>
        {error.stack && <details className="mt-2 text-[12px] text-zinc-300"><summary>Stack</summary><pre className="whitespace-pre-wrap text-[12px] font-mono">{String(error.stack)}</pre></details>}
      </div>
    );
  }

  if (!Comp) return <div className="p-4 text-sm text-zinc-400">Loading 3D preview…</div>;

  const C = Comp as React.ComponentType;
  return <C />;
}
