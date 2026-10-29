'use client';

import { useEffect, useState } from 'react';

export type KeyboardViewport = {
  height: number;
  offsetTop: number;
};

/**
 * Returns the visual viewport whenever it is shorter than the layout viewport.
 * A keyboard can be an overlay (iOS) or resize the layout viewport (Android),
 * and waiting for a large inset leaves the input behind the keyboard on some
 * devices. Any positive inset is therefore treated as a viewport reduction.
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
        keyboardInset > 0
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
