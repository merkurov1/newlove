'use client';

import { useEffect, useState } from 'react';

export type KeyboardViewport = {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
};

const roundPx = (value: number) => Math.round(value);

/**
 * Reads the visual viewport as one geometry object.
 *
 * `window.innerHeight` is not used here: on iOS the layout viewport can stay
 * at its original size while the visual viewport shrinks for the keyboard, so
 * comparing the two makes the keyboard look like it has not opened. The
 * visual viewport itself is already the rectangle the user can actually see,
 * including browser chrome, the on-screen keyboard, pinch-zoom panning and
 * viewport scrolling.
 */
export function readPierrotViewport(): KeyboardViewport | null {
  if (typeof window === 'undefined') return null;

  const viewport = window.visualViewport;
  if (!viewport) return null;

  const width = roundPx(viewport.width);
  const height = roundPx(viewport.height);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width,
    height,
    offsetTop: roundPx(viewport.offsetTop),
    offsetLeft: roundPx(viewport.offsetLeft),
  };
}

/**
 * Returns the modal geometry for the visible viewport while the modal is
 * active. When VisualViewport is unavailable (or temporarily reports an
 * unusable size) the caller falls back to CSS viewport units.
 *
 * Events are coalesced into one animation frame and identical geometry is
 * ignored, so keyboard animations and viewport panning cannot cause a render
 * loop or layout oscillation.
 */
export default function useKeyboardViewportHeight(active: boolean): KeyboardViewport | null {
  const [viewportSize, setViewportSize] = useState<KeyboardViewport | null>(null);

  // Read synchronously on the first render after opening so the modal does not
  // paint at 100dvh for one frame while the effect is being attached.
  const liveViewport = active ? readPierrotViewport() : null;

  useEffect(() => {
    if (!active) {
      setViewportSize(null);
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      setViewportSize(null);
      return;
    }

    let frame: number | null = null;
    let lastKey = '';

    const sync = () => {
      frame = null;

      const next = readPierrotViewport();
      if (!next) return;

      const nextKey = `${next.width}:${next.height}:${next.offsetTop}:${next.offsetLeft}`;
      if (nextKey === lastKey) return;

      lastKey = nextKey;
      setViewportSize(next);
    };

    const scheduleSync = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    viewport.addEventListener('resize', scheduleSync);
    viewport.addEventListener('scroll', scheduleSync);
    window.addEventListener('resize', scheduleSync);
    window.addEventListener('orientationchange', scheduleSync);

    return () => {
      viewport.removeEventListener('resize', scheduleSync);
      viewport.removeEventListener('scroll', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
      window.removeEventListener('orientationchange', scheduleSync);

      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [active]);

  if (!active) return null;

  return liveViewport ?? viewportSize;
}
