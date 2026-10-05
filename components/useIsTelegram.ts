'use client';

import { useEffect, useState } from 'react';

export default function useIsTelegram() {
  const [isTelegram, setIsTelegram] = useState(() => {
    if (typeof window === 'undefined') return false;
    const webApp = (window as any).Telegram?.WebApp;
    return Boolean(webApp && (webApp.initData || webApp.initDataUnsafe?.user || webApp.platform));
  });
  useEffect(() => {
    const check = () => {
      const webApp = (window as any).Telegram?.WebApp;
      setIsTelegram(Boolean(webApp && (webApp.initData || webApp.initDataUnsafe?.user || webApp.platform)));
    };
    check();
    const timer = window.setInterval(check, 800);
    return () => window.clearInterval(timer);
  }, []);
  return isTelegram;
}
