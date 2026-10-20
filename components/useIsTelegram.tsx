'use client';

import { useEffect, useState } from 'react';

const TELEGRAM_DETECTION_INTERVAL_MS = 200;
const TELEGRAM_DETECTION_ATTEMPTS = 100;

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
  const [isTelegram, setIsTelegram] = useState(isTelegramMiniApp);

  useEffect(() => {
    if (isTelegram) return;

    let attempts = 0;
    let timer: number | null = null;

    const check = () => {
      if (isTelegramMiniApp()) {
        setIsTelegram(true);
        return true;
      }

      return false;
    };

    if (check()) return;

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
      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [isTelegram]);

  return isTelegram;
}
