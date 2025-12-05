"use client";

import React, { useEffect, useState } from 'react';

export default function SafeGlitchLoader() {
  const [Comp, setComp] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    import('@/components/unframed/GlitchCanvas')
      .then((m) => {
        if (!mounted) return;
        setComp(() => (m && m.default) ? m.default : null);
      })
      .catch((e) => {
        if (!mounted) return;
        console.error('SafeGlitchLoader import error', e);
        setError(e);
      });
    return () => { mounted = false; };
  }, []);

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400">
        <div className="font-semibold mb-2">Module load error</div>
        <pre className="whitespace-pre-wrap text-xs font-mono">{String(error?.message || error)}</pre>
        {error?.stack && <details className="mt-2 text-[12px] text-zinc-300"><summary>Stack</summary><pre className="whitespace-pre-wrap text-[12px] font-mono">{String(error.stack)}</pre></details>}
      </div>
    );
  }

  if (!Comp) return <div className="p-4 text-sm text-zinc-400">Loading 3D preview…</div>;

  const C = Comp as React.ComponentType;
  return <C />;
}
