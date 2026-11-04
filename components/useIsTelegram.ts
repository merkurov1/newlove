'use client';

import { useEffect, useState } from 'react';

// The SDK is loaded with next/script lazyOnload. Detect it promptly, but do
// not poll for the whole lifetime of the page.
const TELEGRAM_DETECTION_INTERVAL_MS = 50;
const TELEGRAM_DETECTION_ATTEMPTS = 60;

/**
 * The Telegram SDK can also be loaded in a regular browser. Only the
 * initData string is used as a UI hint that the page was opened inside a
 * Telegram Mini App. It is deliberately not treated as authenticated
 * identity; initDataUnsafe is client-controlled and is never used here.
 */
export function isTelegramMiniApp() {
  if (typeof window === 'undefined') return false;

  const webApp = (
    window as Window & {
      Telegram?: {
        WebApp?: {
          initData?: string;
        };
      };
    }
  ).Telegram?.WebApp;

  return Boolean(typeof webApp?.initData === 'string' && webApp.initData.length > 0);
}

export default function useIsTelegram() {
  // The server and the first client render must agree. Telegram is therefore
  // detected after hydration, never from a window lookup in the initializer.
  const [isTelegram, setIsTelegram] = useState(false);

  useEffect(() => {
    if (isTelegram) return;

    let active = true;
    let attempts = 0;
    let timer: number | null = null;

    const check = () => {
      if (!active) return true;

      if (isTelegramMiniApp()) {
        setIsTelegram(true);
        return true;
      }

      return false;
    };

    if (check()) {
      return () => {
        active = false;
      };
    }

    // The SDK is loaded with next/script lazyOnload. Wait for it briefly
    // instead of polling for the whole lifetime of the page.
    timer = window.setInterval(() => {
      attempts += 1;

      if (check() || attempts >= TELEGRAM_DETECTION_ATTEMPTS) {
        if (timer !== null) {
          window.clearInterval(timer);
          timer = null;
        }
      }
    }, TELEGRAM_DETECTION_INTERVAL_MS);

    return () => {
      active = false;

      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [isTelegram]);

  return isTelegram;
}
