"use client";

import React from 'react';
import dynamic from 'next/dynamic';
import { ErrorBoundaryWrapper as ErrorBoundary } from '@/components/unframed/ErrorBoundary';

const DynamicGlitchCanvas = dynamic(
  () => import('@/components/unframed/GlitchCanvas'),
  { ssr: false, loading: () => <div className="p-4 text-sm text-zinc-400">Loading 3D preview…</div> }
);

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
              <DynamicGlitchCanvas />
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
