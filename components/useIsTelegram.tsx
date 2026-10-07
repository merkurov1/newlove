'use client';

import {
  useEffect,
  useState,
} from 'react';

/**
 * Telegram.WebApp can exist in a regular browser
 * after the SDK has loaded.
 *
 * Real Mini App detection relies on Telegram
 * initialization data rather than SDK existence.
 */
export function isTelegramMiniApp() {
  if (typeof window === 'undefined') {
    return false;
  }

  const webApp =
    (window as any).Telegram?.WebApp;

  return Boolean(
    webApp?.initData ||
    webApp?.initDataUnsafe?.user
  );
}

export default function useIsTelegram() {
  const [
    isTelegram,
    setIsTelegram,
  ] = useState(
    isTelegramMiniApp
  );

  useEffect(() => {
    const check = () => {
      setIsTelegram(
        isTelegramMiniApp()
      );
    };

    check();

    const timer =
      window.setInterval(
        check,
        300
      );

    return () =>
      window.clearInterval(timer);
  }, []);

  return isTelegram;
}