"use client";

import React, { useEffect } from 'react';
import GlitchCanvasFallback from './GlitchCanvasFallback';

type Props = {
  onError?: (err: any) => void;
};

export default function SafeGlitchLoader({ onError }: Props) {
  // If a consumer provides onError, forward global errors and unhandled rejections.
  useEffect(() => {
    if (!onError) return;

    const onWindowError = (ev: ErrorEvent) => {
      try { onError(ev.error ?? ev.message ?? ev); } catch { /* ignore */ }
    };

    const onUnhandled = (ev: PromiseRejectionEvent) => {
      try { onError(ev.reason ?? ev); } catch { /* ignore */ }
    };

    window.addEventListener('error', onWindowError as EventListener);
    window.addEventListener('unhandledrejection', onUnhandled as EventListener);

    return () => {
      window.removeEventListener('error', onWindowError as EventListener);
      window.removeEventListener('unhandledrejection', onUnhandled as EventListener);
    };
  }, [onError]);

  // Simplified loader: always render the canvas fallback (no dynamic three imports)
  return <GlitchCanvasFallback />;
}
