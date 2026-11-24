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
export default function AddToHomePrompt() {
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
    <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-50/40 p-4 text-center">
      <p className="font-serif text-sm">Keep the Temple close</p>
      <p className="mt-1 text-[11px] leading-relaxed opacity-70">
        Add it to your Home Screen for a quieter way back.
      </p>
      <div className="mt-3 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={add}
          className="min-h-[40px] rounded-full border border-amber-400/50 bg-amber-200/30 px-4 font-mono text-[10px] uppercase tracking-[.14em]"
        >
          Add
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="min-h-[40px] rounded-full px-3 font-mono text-[10px] uppercase tracking-[.14em] opacity-60"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
