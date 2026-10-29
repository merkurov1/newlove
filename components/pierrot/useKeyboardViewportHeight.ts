'use client';

import { useEffect, useState } from 'react';

export type KeyboardViewport = {
  height: number;
  offsetTop: number;
};

/**
 * Returns the visual viewport only while a real keyboard-sized inset is
 * present. iPad Safari can report a slightly shorter visual viewport even
 * with the keyboard closed, so small differences are intentionally ignored.
 *
 * The offset is needed because iOS can keep a fixed element anchored to the
 * layout viewport while the visual viewport is shifted by the keyboard.
 */
export default function useKeyboardViewportHeight(active: boolean): KeyboardViewport | null {
  const [viewportSize, setViewportSize] = useState<KeyboardViewport | null>(null);

  useEffect(() => {
    if (!active) {
      setViewportSize(null);
      return;
    }

    const viewport = window.visualViewport;

    if (!viewport) return;

    const sync = () => {
      const keyboardInset = window.innerHeight - viewport.height - viewport.offsetTop;

      setViewportSize(
        keyboardInset > 120
          ? {
              height: viewport.height,
              offsetTop: viewport.offsetTop,
            }
          : null
      );
    };

    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);

    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, [active]);

  return viewportSize;
}
