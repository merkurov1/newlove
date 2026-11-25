'use client';

import { useEffect, useState } from 'react';

import useIsTelegram from '@/components/useIsTelegram';
import { getTelegramWebApp, hapticSelection } from '@/lib/telegram/webApp';
import {
  readHomeScreenDismissedAt,
  rememberHomeScreenDismissal,
  resolveHomeScreenPrompt,
  type HomeScreenStatus,
} from '@/lib/telegram/homeScreen';

/**
 * A discreet, dismissible Home Screen offer. It never blocks the Temple and
 * disappears entirely for already-added, unsupported or recently dismissed
 * clients.
 */
export default function AddToHomePrompt({
  className,
}: {
  className?: string;
} = {}) {
  const isTelegram = useIsTelegram();
  const [status, setStatus] = useState<HomeScreenStatus>('unknown');
  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!isTelegram) return;

    const tg = getTelegramWebApp();

    if (!tg || typeof tg.checkHomeScreenStatus !== 'function') {
      setSupported(false);
      setReady(true);
      return;
    }

    setSupported(true);
    setDismissedAt(readHomeScreenDismissedAt(window.localStorage));

    const timer = window.setTimeout(() => {
      try {
        tg.checkHomeScreenStatus?.((value) => {
          setStatus(
            value === 'added' || value === 'missed' || value === 'promptable'
              ? value
              : value === 'unsupported'
                ? 'unsupported'
                : 'unknown'
          );
          setReady(true);
        });
      } catch {
        setReady(true);
      }
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [isTelegram]);

  const action = ready
    ? resolveHomeScreenPrompt({ isTelegram, supported, status, dismissedAtMs: dismissedAt })
    : 'hide';

  if (action !== 'offer') return null;

  const dismiss = () => {
    rememberHomeScreenDismissal(window.localStorage);
    setDismissedAt(Date.now());
    setStatus('unknown');
  };

  const add = () => {
    const tg = getTelegramWebApp();

    hapticSelection();

    try {
      tg?.addToHomeScreen?.((value) => {
        setStatus(value === 'added' ? 'added' : 'unknown');
      });
    } catch {
      /* Optional Telegram method. */
    }

    rememberHomeScreenDismissal(window.localStorage);
    setDismissedAt(Date.now());
  };

  return (
    <section
      className={className}
      aria-labelledby="temple-add-to-home-title"
      data-testid="add-to-home-group"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-white/30 px-3 py-2.5">
        <div className="min-w-0 text-left">
          <p
            id="temple-add-to-home-title"
            className="font-mono text-[8px] uppercase tracking-[.22em] opacity-55"
          >
            Add to Home
          </p>
          <p className="mt-0.5 font-serif text-[13px] leading-snug opacity-75">
            Keep the Temple one tap away.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={add}
            className="min-h-[44px] min-w-[44px] rounded-full border border-amber-400/40 px-3 font-mono text-[9px] uppercase tracking-[.14em]"
          >
            Add
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-[44px] min-w-[44px] px-2 font-mono text-[9px] uppercase tracking-[.14em] opacity-55"
          >
            Not now
          </button>
        </div>
      </div>
    </section>
  );
}
