'use client';

import { useEffect, useState } from 'react';

/**
 * Returns the number of pixels the on-screen keyboard covers at the bottom of
 * the layout viewport. The Art Engine composer is fixed to the bottom, so it is
 * lifted by that amount while the keyboard is open.
 *
 * VisualViewport is the authoritative rectangle on iOS Safari: innerHeight can
 * stay unchanged while the keyboard shrinks the visible area.
 */
export default function useComposerOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    let frame: number | null = null;

    const sync = () => {
      frame = null;

      const covered = Math.max(
        0,
        Math.round(
          window.innerHeight - (viewport.height + viewport.offsetTop),
        ),
      );

      // Ignore tiny browser-chrome differences; only a real keyboard gap
      // should move the composer.
      setOffset(covered > 80 ? covered : 0);
    };

    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);

    return () => {
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return offset;
}
