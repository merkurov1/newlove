'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { registerTelegramBackHandler } from '@/lib/telegram/backHandler';
import { logTempleEvent } from '@/lib/templeLogger';
import {
  markLeftWithoutTrace,
  shouldRecordRitualTrace,
  visitDurationMinutes,
} from '@/lib/temple/visitTrace';
import AbsolutionClient from '@/app/absolution/AbsolutionClient';

/**
 * Dedicated compact Absolution ritual.
 *
 * Unlike the shared full-screen RitualModal, this dialog floats over the
 * Temple so the Sanctuary remains visible behind the ceremony. The canonical
 * /absolution route still renders the same AbsolutionClient as a full page.
 */
export default function AbsolutionModal({
  title = 'Absolution',
  canonicalPath = '/absolution',
  children,
}: {
  title?: string;
  canonicalPath?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const goBack = router.back;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const startedAtRef = useRef<number>(0);
  const finalizedRef = useRef(false);

  const finalizeVisit = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;

    const endedAt = Date.now();
    const duration = endedAt - startedAtRef.current;

    if (!shouldRecordRitualTrace(startedAtRef.current, endedAt)) {
      markLeftWithoutTrace();
      return;
    }

    // A visit long enough to matter becomes a trace. Reuse the existing
    // MODAL_OPEN event type so no schema or event vocabulary changes.
    void logTempleEvent({
      event_type: 'MODAL_OPEN',
      message: `Visited ${title} for ${visitDurationMinutes(
        startedAtRef.current,
        endedAt
      )} min (${Math.round(duration / 1000)}s).`,
    });
  }, [title]);

  const close = useCallback(() => {
    finalizeVisit();
    goBack();
  }, [finalizeVisit, goBack]);

  useEffect(() => {
    startedAtRef.current = Date.now();
    finalizedRef.current = false;
    returnFocusRef.current = document.activeElement as HTMLElement | null;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousOverscroll = body.style.overscrollBehavior;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const scrollPosition = window.scrollY;

    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    body.classList.add('absolution-modal-open');

    const focusTimer = window.setTimeout(() => {
      closeRef.current?.focus();
    }, 0);

    const getFocusable = () => {
      const dialog = dialogRef.current;
      if (!dialog) return [];

      return Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (!focusable.length) return;

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

    document.addEventListener('keydown', handleKeyDown);

    const unregisterBack = registerTelegramBackHandler(() => {
      close();
      return true;
    });

    return () => {
      window.clearTimeout(focusTimer);
      finalizeVisit();

      body.style.overflow = previousOverflow;
      body.style.overscrollBehavior = previousOverscroll;
      document.documentElement.style.overflow = previousHtmlOverflow;
      body.classList.remove('absolution-modal-open');

      document.removeEventListener('keydown', handleKeyDown);
      unregisterBack();

      returnFocusRef.current?.focus?.();

      // The intercepted route replaces the modal with the Temple underneath,
      // so put the Sanctuary back exactly where the pilgrim left it.
      try {
        window.scrollTo(0, scrollPosition);
      } catch {
        // Scroll restoration is best effort in restricted webviews.
      }
    };
  }, [close, finalizeVisit]);

  return (
    <div
      className="absolution-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        className="absolution-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="absolution-modal-title"
        tabIndex={-1}
        data-testid="absolution-modal"
      >
        <header className="absolution-modal__header">
          <div className="absolution-modal__heading">
            <span className="absolution-modal__eyebrow">
              The Digital Temple
            </span>

            <h2 id="absolution-modal-title">{title}</h2>
          </div>

          <Link
            href={canonicalPath}
            replace
            className="absolution-modal__fullpage"
          >
            Full page ↗
          </Link>

          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close Absolution"
            className="absolution-modal__close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="absolution-modal__body">
          {children ?? <AbsolutionClient variant="modal" />}
        </div>
      </div>
    </div>
  );
}
