'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { registerTelegramBackHandler } from '@/lib/telegram/backHandler';

const RITUALS = [
  ['Calm', '/heartandangel/calm'],
  ['Let It Go', '/heartandangel/letitgo'],
  ['Vigil', '/vigil'],
  ['Absolution', '/absolution'],
  ['Cast', '/cast'],
  ['Tribute', '/tribute'],
] as const;

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

  const close = useCallback(() => router.back(), [router]);

  useEffect(() => {
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

    document.addEventListener('keydown', handleKey);
    const unregisterBack = registerTelegramBackHandler(() => {
      close();
      return true;
    });

    return () => {
      document.body.classList.remove('ritual-modal-open');
      document.removeEventListener('keydown', handleKey);
      unregisterBack();
      returnFocusRef.current?.focus?.();
    };
  }, [close]);

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
          <button type="button" onClick={close}>← Temple</button>
          <strong>{title}</strong>
          <Link href={canonicalPath}>Full page ↗</Link>
        </header>
        <div className="temple-modal__content">{children}</div>
        <nav className="temple-modal__dock" aria-label="Switch ritual">
          {RITUALS.map(([label, href]) => (
            <Link key={href} href={href} aria-current={href === canonicalPath ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
