'use client';

import { useEffect, useRef, useState } from 'react';

import useIsTelegram from '@/components/useIsTelegram';
import { getTelegramWebApp, hapticSelection } from '@/lib/telegram/webApp';
import {
  readHomeScreenDismissedAt,
  rememberHomeScreenDismissal,
  resolveHomeScreenPrompt,
  type HomeScreenStatus,
} from '@/lib/telegram/homeScreen';

/**
 * A small, Flow-specific Home Screen offer. It waits until the reader reaches
 * the end of the feed, checks Telegram only once, and disappears for a month
 * after either choice. Nothing here blocks reading.
 */
export default function FlowHomeScreenPrompt({ className }: { className?: string }) {
  const isTelegram = useIsTelegram();
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<HomeScreenStatus>('unknown');
  const [resolved, setResolved] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!isTelegram) return;

    const node = containerRef.current;

    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px 0px' }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [isTelegram]);

  useEffect(() => {
    if (!isTelegram || !visible || resolved) return;

    const tg = getTelegramWebApp();

    if (!tg || typeof tg.checkHomeScreenStatus !== 'function') {
      setSupported(false);
      setResolved(true);
      return;
    }

    setSupported(true);
    setDismissedAt(readHomeScreenDismissedAt(window.localStorage));

    let cancelled = false;
    const timer = window.setTimeout(() => {
      try {
        tg.checkHomeScreenStatus?.((value) => {
          if (cancelled) return;

          setStatus(
            value === 'added' || value === 'missed' || value === 'promptable'
              ? value
              : value === 'unsupported'
                ? 'unsupported'
                : 'unknown'
          );
          setResolved(true);
        });
      } catch {
        setResolved(true);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isTelegram, resolved, visible]);

  const action =
    visible && resolved
      ? resolveHomeScreenPrompt({ isTelegram, supported, status, dismissedAtMs: dismissedAt })
      : 'hide';

  const dismiss = () => {
    rememberHomeScreenDismissal(window.localStorage);
    setDismissedAt(Date.now());
    setStatus('unknown');
  };

  const add = () => {
    const tg = getTelegramWebApp();

    hapticSelection();

    rememberHomeScreenDismissal(window.localStorage);
    setDismissedAt(Date.now());

    try {
      tg?.addToHomeScreen?.((value) => {
        // Only a confirmed `added` is reported as success.
        setStatus(value === 'added' ? 'added' : 'unknown');
      });
    } catch {
      setStatus('unknown');
    }
  };

  if (!visible && !isTelegram) return null;

  if (action !== 'offer') {
    return <div ref={containerRef} className={className} aria-hidden="true" />;
  }

  return (
    <div ref={containerRef} className={`flow-home-screen ${className ?? ''}`.trim()}>
      <p className="flow-home-screen__label">Add to Home Screen</p>
      <p className="flow-home-screen__copy">Keep Flow one tap away.</p>

      <div className="flow-home-screen__actions">
        <button type="button" onClick={add} className="flow-home-screen__add">
          Add
        </button>
        <button type="button" onClick={dismiss} className="flow-home-screen__dismiss">
          Not now
        </button>
      </div>
    </div>
  );
}
