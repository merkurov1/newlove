'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { hapticGallery, hapticReader } from '@/lib/telegram/webApp';

export type FlowViewerImage = {
  src: string;
  alt: string;
  caption?: string | null;
};

type Props = {
  images: FlowViewerImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.4;

type Point = Pick<Touch, 'clientX' | 'clientY'>;

function distance(a: Point, b: Point) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

/**
 * Focused, Telegram-native image viewer for one Flow gallery.
 *
 * It intentionally reuses no third-party lightbox: Telegram's WebView reports
 * incomplete pointer and gesture support across versions, so swipe, pinch and
 * double-tap are implemented with explicit fallbacks. Telegram's BackButton is
 * handled by `FlowReaderShell`; Escape, Arrow keys, browser Back and the close
 * affordance all end the same way.
 *
 * The overlay is portalled to `document.body`. The reader article keeps a
 * `transform` after its entry animation with `animation-fill-mode: both`, which
 * turns it into the containing block for every `position: fixed` descendant.
 * Rendering inline therefore pinned the viewer to the article's box (below the
 * masthead) instead of the real viewport.
 */
export default function FlowImageViewer({ images, index, onClose, onIndexChange }: Props) {
  const current = images[index] ?? images[0];
  const [scale, setScale] = useState(1);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const pushedHistoryRef = useRef(false);
  const previousFocusRef = useRef<Element | null>(null);
  const touchRef = useRef<{
    x: number;
    y: number;
    time: number;
    pinchDistance: number | null;
    pinchScale: number;
  }>({ x: 0, y: 0, time: 0, pinchDistance: null, pinchScale: 1 });
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const close = useCallback(() => {
    const shouldPopHistory = pushedHistoryRef.current;

    pushedHistoryRef.current = false;
    closeRef.current();

    // The entry we pushed points at the same reader URL. Going back keeps the
    // browser history honest without navigating away from the publication.
    if (shouldPopHistory) {
      try {
        window.history.back();
      } catch {
        /* Browser history is best-effort. */
      }
    }
  }, []);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= images.length || next === index) return;

      setScale(1);
      setDrag({ x: 0, y: 0 });
      hapticGallery();
      onIndexChange(next);
    },
    [images.length, index, onIndexChange]
  );

  // Focus management and focus restoration. Runs once the portal is committed
  // so the dialog and close affordance can actually receive focus.
  useEffect(() => {
    previousFocusRef.current = document.activeElement;

    const dialog = dialogRef.current;

    dialog?.focus();

    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(timer);

      const previous = previousFocusRef.current;

      if (previous instanceof HTMLElement && previous.isConnected) {
        try {
          previous.focus({ preventScroll: true });
        } catch {
          /* Focus restoration is optional. */
        }
      }
    };
  }, []);

  // Background scroll lock. The overlay itself also has `touch-action: none`.
  // iOS may clamp the scroll position when `overflow: hidden` is applied, so
  // the reading position is captured and restored before the overlay unmounts.
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = html.style.overflow;
    const previousOverscroll = body.style.overscrollBehavior;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    hapticReader('open');

    return () => {
      body.style.overflow = previousBodyOverflow;
      html.style.overflow = previousHtmlOverflow;
      body.style.overscrollBehavior = previousOverscroll;

      if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
        try {
          window.scrollTo({ left: scrollX, top: scrollY, behavior: 'auto' });
        } catch {
          /* Scroll restoration is best-effort. */
        }
      }
    };
  }, []);

  // Browser Back closes the viewer instead of leaving the publication.
  useEffect(() => {
    try {
      window.history.pushState({ ...(window.history.state || {}), __flowImageViewer: true }, '');
      pushedHistoryRef.current = true;
    } catch {
      pushedHistoryRef.current = false;
    }

    const handlePopState = () => {
      if (!pushedHistoryRef.current) return;

      pushedHistoryRef.current = false;
      closeRef.current();
    };

    window.addEventListener('popstate', handlePopState);

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(index + 1);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(index - 1);
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    );

    if (!focusable || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touches = event.touches;

    if (touches.length >= 2) {
      touchRef.current = {
        x: 0,
        y: 0,
        time: Date.now(),
        pinchDistance: distance(touches[0], touches[1]),
        pinchScale: scale,
      };
      setDragging(false);
      return;
    }

    const touch = touches[0];

    touchRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      pinchDistance: null,
      pinchScale: scale,
    };
    setDragging(true);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const touches = event.touches;

    if (touches.length >= 2) {
      const start = touchRef.current;

      if (!start.pinchDistance) return;

      const nextDistance = distance(touches[0], touches[1]);
      const ratio = nextDistance / start.pinchDistance;

      setScale(clampScale(start.pinchScale * ratio));
      return;
    }

    if (scale > 1) return;

    const touch = touches[0];

    if (!touch) return;

    setDrag({
      x: touch.clientX - touchRef.current.x,
      y: touch.clientY - touchRef.current.y,
    });
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchRef.current;

    if (event.touches.length > 0) return;

    const touch = event.changedTouches[0];
    const dx = touch ? touch.clientX - start.x : 0;
    const dy = touch ? touch.clientY - start.y : 0;
    const now = Date.now();
    const isPinch = Boolean(start.pinchDistance);

    setDragging(false);

    if (isPinch) {
      touchRef.current = { ...start, pinchDistance: null, pinchScale: scale };
      return;
    }

    if (scale > 1) {
      setDrag({ x: 0, y: 0 });
      return;
    }

    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      setDrag({ x: 0, y: 0 });
      goTo(dx < 0 ? index + 1 : index - 1);
      return;
    }

    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
      setDrag({ x: 0, y: 0 });
      hapticReader('close');
      close();
      return;
    }

    // Double tap toggles a reliable 2.4x zoom without requiring pinch.
    const lastTap = lastTapRef.current;
    const withinDoubleTap =
      now - lastTap.time < 320 &&
      Math.hypot(touch ? touch.clientX - lastTap.x : 0, touch ? touch.clientY - lastTap.y : 0) < 32;

    if (withinDoubleTap) {
      setScale((value) => (value > 1 ? 1 : DOUBLE_TAP_SCALE));
      setDrag({ x: 0, y: 0 });
      lastTapRef.current = { time: 0, x: 0, y: 0 };
      return;
    }

    lastTapRef.current = { time: now, x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
    setDrag({ x: 0, y: 0 });
  };

  // The viewer is opened by a client interaction, so this branch is never part
  // of the server-rendered reader markup. It still keeps a future server import
  // safe and avoids touching `document` during SSR.
  if (!current || typeof document === 'undefined') return null;

  const caption = current.caption || '';
  const visibleCaption = caption || current.alt;
  const hasMultiple = images.length > 1;
  const transform =
    scale > 1
      ? `scale(${scale})`
      : drag.x || drag.y
        ? `translate3d(${drag.x * 0.35}px, ${drag.y * 0.35}px, 0)`
        : undefined;

  const overlay = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      tabIndex={-1}
      data-testid="flow-image-viewer"
      data-multiple={hasMultiple ? 'true' : 'false'}
      className="flow-viewer"
      onKeyDown={handleKeyDown}
      onDoubleClick={() => setScale((value) => (value > 1 ? 1 : DOUBLE_TAP_SCALE))}
    >
      <header className="flow-viewer__bar">
        <p className="flow-viewer__counter" aria-live="polite">
          {hasMultiple ? `${index + 1} / ${images.length}` : 'Image'}
        </p>

        <button
          ref={closeButtonRef}
          type="button"
          className="flow-viewer__close"
          onClick={close}
          aria-label="Close image viewer"
        >
          <X size={20} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </header>

      <figure className="flow-viewer__figure">
        {/* The caption is a sibling of the gesture stage, not a child: the
            stage owns `touch-action: none`, while a long caption keeps native
            vertical scrolling on touch devices. */}
        <div
          className="flow-viewer__stage"
          onClick={(event) => {
            if (event.target === event.currentTarget && scale === 1) close();
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          {hasMultiple && (
            <button
              type="button"
              className="flow-viewer__nav flow-viewer__nav--prev"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              aria-label="Previous image"
            >
              ←
            </button>
          )}

          {/* A single full-resolution image, not a second gallery renderer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={current.src}
            src={current.src}
            alt={current.alt}
            className="flow-viewer__image"
            draggable={false}
            style={{
              transform,
              transition: dragging ? 'none' : 'transform 180ms ease',
              cursor: scale > 1 ? 'zoom-out' : 'zoom-in',
            }}
          />

          {hasMultiple && (
            <button
              type="button"
              className="flow-viewer__nav flow-viewer__nav--next"
              onClick={() => goTo(index + 1)}
              disabled={index === images.length - 1}
              aria-label="Next image"
            >
              →
            </button>
          )}
        </div>

        {visibleCaption && (
          <figcaption
            className="flow-viewer__caption"
            tabIndex={0}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {visibleCaption}
          </figcaption>
        )}
      </figure>
    </div>
  );

  return createPortal(overlay, document.body);
}
