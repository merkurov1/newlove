'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  onClose: () => void;
  side: 'left' | 'right';
  labelledBy: string;
  testId?: string;
  children: ReactNode;
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Accessible sheet used by the Flow reader appearance and contents controls.
 *
 * It is intentionally a modal because it is opened explicitly and closed by
 * Escape, the backdrop or the close affordance. While closed it renders
 * nothing, so it can never sit over the reading column.
 */
export default function FlowReaderDialog({ onClose, side, labelledBy, testId, children }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const panel = panelRef.current;

    if (!panel) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusable = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) =>
          !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
      );

    const focusFrame = window.requestAnimationFrame(() => {
      const first = getFocusable()[0];
      (first || panel).focus();
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusable();

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;

      const restoreTarget = restoreFocusRef.current;
      restoreFocusRef.current = null;

      if (restoreTarget && document.contains(restoreTarget)) {
        restoreTarget.focus({ preventScroll: true });
      }
    };
  }, [onClose]);

  return (
    <div className="flow-reader-dialog" data-testid={testId}>
      <div
        className="flow-reader-dialog__backdrop"
        aria-hidden="true"
        onClick={onClose}
        data-reader-backdrop
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`flow-reader-dialog__panel flow-reader-dialog__panel--${side}`}
      >
        {children}
      </aside>
    </div>
  );
}
