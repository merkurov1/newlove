'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { registerTelegramBackHandler } from '@/lib/telegram/backHandler';
import TributeExperience from '@/app/tribute/TributeExperience';

/**
 * In-place Tribute journey for the Temple homepage.
 *
 * Opening this panel changes no URL and never charges anything. The shared
 * TributeExperience still requires an explicit amount and an explicit
 * "Offer" action before it asks the server to create a Stripe Checkout
 * session, and payment confirmation still happens only through server-side
 * Stripe verification.
 */
export default function TempleTributeModal({
  initialAmount,
  onClose,
}: {
  initialAmount?: number;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      closeRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
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

    document.addEventListener('keydown', handleKeyDown);

    const unregisterBack = registerTelegramBackHandler(() => {
      onClose();
      return true;
    });

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      unregisterBack();
      returnFocusRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="temple-tribute-title"
        className="tribute-panel relative flex w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-amber-300/20 bg-[#141210] text-stone-200 shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-center gap-3 border-b border-amber-300/15 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <h2
            id="temple-tribute-title"
            className="mr-auto font-serif text-lg tracking-[0.16em]"
          >
            Tribute
          </h2>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close Tribute"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-stone-300 transition-colors hover:bg-white/10 hover:text-stone-100"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TributeExperience
            embedded
            initialAmount={initialAmount}
          />
        </div>
      </section>
    </div>
  );
}
