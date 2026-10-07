'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  isTelegramMiniApp,
} from '@/components/useIsTelegram';

const RITUAL_ROUTES = [
  '/temple',
  '/heartandangel/calm',
  '/heartandangel/letitgo',
  '/vigil',
  '/absolution',
  '/tribute',
];

function isRitualRoute(
  pathname: string
) {
  const normalized =
    pathname.replace(/\/$/, '') || '/';

  return RITUAL_ROUTES.some(
    (route) =>
      normalized === route ||
      normalized.startsWith(`${route}/`)
  );
}

export default function TelegramMiniApp() {
  const pathname =
    usePathname() || '';

  useEffect(() => {
    const ritual =
      isRitualRoute(pathname);

    document.body.classList.toggle(
      'ritual-route',
      ritual
    );

    if (!isTelegramMiniApp()) {
      document.body.classList.remove(
        'telegram-app'
      );

      document.documentElement.classList.remove(
        'telegram-mini-app'
      );

      return;
    }

    const tg =
      (window as any).Telegram?.WebApp;

    if (!tg) return;

    try {
      tg.ready?.();
      tg.expand?.();
    } catch {}

    const user =
      tg.initDataUnsafe?.user;

    if (user) {
      const displayName =
        user.username ||
        user.first_name ||
        'Pilgrim';

      localStorage.setItem(
        'temple_user',
        displayName
      );

      localStorage.setItem(
        'tg_user',
        JSON.stringify(user)
      );
    }

    document.body.classList.add(
      'telegram-app'
    );

    document.documentElement.classList.add(
      'telegram-mini-app'
    );

    const syncViewport = () => {
      try {
        tg.expand?.();
      } catch {}
    };

    tg.onEvent?.(
      'viewportChanged',
      syncViewport
    );

    window.addEventListener(
      'resize',
      syncViewport
    );

    return () => {
      tg.offEvent?.(
        'viewportChanged',
        syncViewport
      );

      window.removeEventListener(
        'resize',
        syncViewport
      );

      document.body.classList.remove(
        'telegram-app'
      );

      document.documentElement.classList.remove(
        'telegram-mini-app'
      );

      document.body.classList.remove(
        'ritual-route'
      );
    };
  }, [pathname]);

  return null;
}