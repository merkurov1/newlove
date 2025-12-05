"use client";

import React, { useState } from 'react';
import SafeGlitchLoader from '@/components/unframed/SafeGlitchLoader';
import { ErrorBoundaryWrapper as ErrorBoundary } from '@/components/unframed/ErrorBoundary';

export default function UnframedDebugPage() {
  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">UNFRAMED — 3D Debug</h1>
        <p className="text-sm text-zinc-400 mb-4">This page renders the client-only 3D preview in isolation so you can inspect errors and copy stacks on mobile devices.</p>

        <div className="border border-zinc-800 rounded-md overflow-hidden">
          <div className="bg-zinc-900/40 px-4 py-2 text-xs text-zinc-300">Canvas area — errors will be caught by the boundary below</div>
          <div className="h-[480px] w-full bg-black">
            <ErrorBoundary>
              <SafeGlitchLoader onError={(err) => {
                const ev = new CustomEvent('safeglitch:error', { detail: err });
                window.dispatchEvent(ev);
              }} />
            </ErrorBoundary>
          </div>
        </div>

        <div className="mt-6 text-sm text-zinc-400">
          <p className="mb-2">If the 3D preview fails, open <code className="font-mono">/unframed?debug3d=1</code> or use this page and tap "Show details" to copy the error stack.</p>
          <p className="text-xs text-zinc-600">Note: this page is client-only and uses a dynamic import with SSR disabled to avoid server-side failures.</p>
        </div>
      </div>
    </div>
  );
}

function DebugInspector() {
  const [last, setLast] = useState<any>(null);

  React.useEffect(() => {
    const onErr = (e: any) => setLast(e.detail);
    window.addEventListener('safeglitch:error', onErr as EventListener);
    return () => window.removeEventListener('safeglitch:error', onErr as EventListener);
  }, []);

  if (!last) return (
    <div className="mt-4 p-4 text-sm text-zinc-400">No loader errors detected yet. If the canvas fails to load you'll see module errors here with a copy button.</div>
  );

  const text = `${last.phase}\n\n${last.message || ''}\n\n${last.stack || ''}`;

  return (
    <div className="mt-4 p-4 bg-black/50 border border-zinc-800 rounded text-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="font-semibold">Loader error captured</div>
        <div className="flex gap-2">
          <button className="px-2 py-1 bg-zinc-800 text-xs rounded" onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
        </div>
      </div>
      <pre className="mt-2 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-auto">{text}</pre>
    </div>
  );
}
