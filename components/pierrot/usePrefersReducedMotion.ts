'use client';

import { useEffect, useState } from 'react';

export default function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPrefersReducedMotion(mediaQuery.matches);

    sync();
    mediaQuery.addEventListener?.('change', sync);

    return () => mediaQuery.removeEventListener?.('change', sync);
  }, []);

  return prefersReducedMotion;
}
