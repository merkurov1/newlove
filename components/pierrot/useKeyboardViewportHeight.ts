'use client';

import { useEffect, useState } from 'react';

/**
 * Returns the visual viewport height only while a real keyboard-sized inset
 * is present. iPad Safari can report a slightly shorter visual viewport even
 * with the keyboard closed, so small differences are intentionally ignored.
 */
export default function useKeyboardViewportHeight(active: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      setHeight(null);
      return;
    }

    const viewport = window.visualViewport;

    if (!viewport) return;

    const sync = () => {
      const keyboardInset = window.innerHeight - viewport.height - viewport.offsetTop;
      setHeight(keyboardInset > 120 ? viewport.height : null);
    };

    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);

    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, [active]);

  return height;
}
