'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

import { resolveRevealSource, writeRevealVars } from './modalReveal';

/**
 * The reference transition is exactly `.75s`; the JS delay only decides when
 * the intercepted route is actually popped, so the closing circle can finish.
 */
export const MODAL_REVEAL_DURATION_MS = 750;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type Options = {
  /** Canonical ritual path used to find the trigger again on close. */
  path: string;
  /** The overlay that receives `--x`, `--y` and `--c`. */
  overlayRef: RefObject<HTMLElement | null>;
  /** Ritual accent used when the trigger itself does not expose one. */
  accent?: string;
  /** Runs when the closing circle has collapsed. */
  onClosed: () => void;
};

export function useModalReveal({
  path,
  overlayRef,
  accent,
  onClosed,
}: Options) {
  const [open, setOpen] = useState(false);
  const closedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const onClosedRef = useRef(onClosed);

  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  const syncVars = useCallback(() => {
    const overlay = overlayRef.current;

    if (!overlay) return null;

    const source = resolveRevealSource(path);

    if (source) {
      writeRevealVars(overlay, source);
    } else if (accent) {
      overlay.style.setProperty('--c', accent);
    }

    return source;
  }, [accent, overlayRef, path]);

  useEffect(() => {
    syncVars();

    let frame = 0;
    let fallback = 0;

    const reveal = () => setOpen(true);

    if (
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    ) {
      // One frame paints the closed circle, the next starts the transition.
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(reveal);
      });
    } else {
      fallback = window.setTimeout(reveal, 0);
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (fallback) window.clearTimeout(fallback);
    };
  }, [syncVars]);

  const close = useCallback(() => {
    if (closedRef.current) return;

    closedRef.current = true;

    // Re-measure the trigger so the collapse targets its *current* centre,
    // including any layout shifts while the modal was open.
    syncVars();
    setOpen(false);

    const duration = prefersReducedMotion()
      ? 0
      : MODAL_REVEAL_DURATION_MS;

    timerRef.current = window.setTimeout(() => {
      onClosedRef.current();
    }, duration);
  }, [syncVars]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { open, close };
}
