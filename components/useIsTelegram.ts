'use client';

import { useEffect, useState } from 'react';

export default function useIsTelegram() {
  const [isTelegram, setIsTelegram] = useState(false);
  useEffect(() => {
    const check = () => setIsTelegram(Boolean((window as any).Telegram?.WebApp?.initData));
    check();
    const timer = window.setInterval(check, 800);
    return () => window.clearInterval(timer);
  }, []);
  return isTelegram;
}
