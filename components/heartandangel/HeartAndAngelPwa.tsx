'use client';

import { useEffect } from 'react';
import useIsTelegram, { isTelegramMiniApp } from '@/components/useIsTelegram';

/**
 * Registers the Heart & Angel service worker only for the public PWA.
 *
 * Telegram already has its own lifecycle, viewport and navigation. The worker
 * is deliberately not registered inside a Telegram WebView, including the
 * in-app browser, so it cannot interfere with the Mini App SDK.
 *
 * Registration is production-only so Next.js development/HMR is unaffected.
 */

// Telegram's SDK is loaded lazily; wait past the detection window before
// deciding that this is a regular browser.
const REGISTRATION_DELAY_MS = 3500;

type TelegramWebViewWindow = Window & {
  TelegramWebviewProxy?: unknown;
  TelegramWebviewProxyProto?: unknown;
};

function isLikelyTelegramWebView() {
  if (typeof window === 'undefined') return false;

  const telegramWindow = window as TelegramWebViewWindow;

  if (telegramWindow.TelegramWebviewProxy || telegramWindow.TelegramWebviewProxyProto) {
    return true;
  }

  return /Telegram/i.test(navigator.userAgent);
}

export default function HeartAndAngelPwa() {
  const isTelegram = useIsTelegram();

  useEffect(() => {
    if (isTelegram) return;
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined') return;
    if (!window.isSecureContext) return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;
    let timer: number | null = null;

    const register = () => {
      if (cancelled) return;

      // Re-check after the delay: the SDK may have arrived while we waited.
      if (isTelegramMiniApp() || isLikelyTelegramWebView()) return;

      navigator.serviceWorker
        .register('/heartandangel-sw.js', {
          scope: '/heartandangel',
          updateViaCache: 'none',
        })
        .catch((error) => {
          // A failed registration must never break artwork or navigation.
          console.warn(
            'Heart & Angel service worker registration failed:',
            error
          );
        });
    };

    const schedule = () => {
      timer = window.setTimeout(register, REGISTRATION_DELAY_MS);
    };

    if (document.readyState === 'complete') {
      schedule();
    } else {
      window.addEventListener('load', schedule, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);

      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [isTelegram]);

  return null;
}
