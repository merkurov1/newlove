'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { registerTelegramBackHandler } from '@/lib/telegram/backHandler';
import { logTempleEvent } from '@/lib/templeLogger';
import {
  markLeftWithoutTrace,
  shouldRecordRitualTrace,
  visitDurationMinutes,
} from '@/lib/temple/visitTrace';
import { TEMPLE_RITUAL_LINKS } from '@/lib/temple/ritualMenu';
import { RITUAL_TIMER_EVENT } from './useRitualModalTimer';

export default function RitualModal({
  title,
  canonicalPath,
  children,
}: {
  title: string;
  canonicalPath: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const startedAtRef = useRef<number>(0);
  const finalizedRef = useRef(false);
  const [timerLabel, setTimerLabel] = useState<string | null>(null);

  const finalizeVisit = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;

    const endedAt = Date.now();
    const duration = endedAt - startedAtRef.current;

    if (!shouldRecordRitualTrace(startedAtRef.current, endedAt)) {
      markLeftWithoutTrace();
      return;
    }

    // A visit long enough to matter becomes a trace. This uses the existing
    // MODAL_OPEN event type; no new database event or schema change is needed.
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
    router.back();
  }, [finalizeVisit, router]);

  useEffect(() => {
    startedAtRef.current = Date.now();
    finalizedRef.current = false;
    returnFocusRef.current = document.activeElement as HTMLElement | null;

    const dialog = dialogRef.current;
    dialog?.focus();
    document.body.classList.add('ritual-modal-open');

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      );

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

    const handleTimer = (event: Event) => {
      const detail = (event as CustomEvent<string | null>).detail;
      setTimerLabel(typeof detail === 'string' && detail ? detail : null);
    };

    document.addEventListener('keydown', handleKey);
    window.addEventListener(RITUAL_TIMER_EVENT, handleTimer);

    const unregisterBack = registerTelegramBackHandler(() => {
      close();
      return true;
    });

    return () => {
      finalizeVisit();
      document.body.classList.remove('ritual-modal-open');
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener(RITUAL_TIMER_EVENT, handleTimer);
      unregisterBack();
      returnFocusRef.current?.focus?.();
    };
  }, [close, finalizeVisit]);

  return (
    <div className="temple-modal" role="presentation">
      <div
        ref={dialogRef}
        className="temple-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} ritual`}
        tabIndex={-1}
      >
        <header className="temple-modal__header">
          <button type="button" onClick={close}>
            ← Temple
          </button>
          <strong>{title}</strong>
          {timerLabel && (
            <span
              className="temple-modal__timer font-mono text-[10px] uppercase tracking-[.14em] text-amber-200/80"
              aria-live="polite"
            >
              {timerLabel}
            </span>
          )}
          <Link href={canonicalPath} replace>
            Full page ↗
          </Link>
        </header>

        <div className="temple-modal__content">{children}</div>

        <nav className="temple-modal__dock" aria-label="Switch ritual">
          {TEMPLE_RITUAL_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              replace
              aria-current={href === canonicalPath ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
