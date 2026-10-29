'use client';

import { useEffect, useState } from 'react';

export type KeyboardViewport = {
  height: number;
  offsetTop: number;
};

/**
 * Returns the visual viewport only while a keyboard-sized inset is present.
 * Small differences are browser chrome (toolbar/scrollbar), not a keyboard;
 * shrinking the window for them leaves a visible gray strip at the bottom.
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

    let focusTimer: number | null = null;

    const handleFocus = () => {
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      // The keyboard can appear after focus without a reliable resize event.
      focusTimer = window.setTimeout(sync, 350);
    };

    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    document.addEventListener('focusin', handleFocus);

    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      document.removeEventListener('focusin', handleFocus);

      if (focusTimer !== null) window.clearTimeout(focusTimer);
    };
  }, [active]);

  return viewportSize;
}
