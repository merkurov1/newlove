'use client';

import { useEffect, useState } from 'react';

/**
 * The Telegram SDK creates window.Telegram.WebApp in a regular browser too.
 * Its existence (and especially `platform`) is therefore not enough to tell
 * whether the page is actually running inside a Mini App.
 */
export function isTelegramMiniApp() {
  if (typeof window === 'undefined') return false;
  const webApp = (window as any).Telegram?.WebApp;
  return Boolean(webApp?.initData || webApp?.initDataUnsafe?.user);
}

export default function useIsTelegram() {
  const [isTelegram, setIsTelegram] = useState(isTelegramMiniApp);
  useEffect(() => {
    const check = () => setIsTelegram(isTelegramMiniApp());
    check();
    const timer = window.setInterval(check, 800);
    return () => window.clearInterval(timer);
  }, []);
  return isTelegram;
}
