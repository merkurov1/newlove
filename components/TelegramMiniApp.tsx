'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import useIsTelegram from '@/components/useIsTelegram';
import TelegramNavigation from '@/components/telegram/TelegramNavigation';

const RITUAL_ROUTES = [
  '/temple',
  '/heartandangel/calm',
  '/heartandangel/letitgo',
  '/vigil',
  '/absolution',
  '/tribute',
];

const WORLD_ROUTE = '/heartandangel/world';

type TelegramInset = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

type TelegramWebApp = {
  initData?: string;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
  BackButton?: {
    show?: () => void;
    hide?: () => void;
    onClick?: (handler: () => void) => void;
    offClick?: (handler: () => void) => void;
  };
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

function isRitualRoute(pathname: string) {
  const normalized = pathname.replace(/\/$/, '') || '/';

  return RITUAL_ROUTES.some((route) => normalized === route || normalized.startsWith(`${route}/`));
}

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;

  const webApp = (window as TelegramWindow).Telegram?.WebApp;

  return webApp && typeof webApp === 'object' ? webApp : null;
}

function setPixelVariable(name: string, value?: number) {
  if (typeof document === 'undefined') return;

  const pixels = Math.max(0, Number(value) || 0);

  document.documentElement.style.setProperty(name, `${pixels}px`);
}

function syncSafeArea(tg: TelegramWebApp) {
  const safe = tg.safeAreaInset || {};
  const content = tg.contentSafeAreaInset || {};

  setPixelVariable('--tg-safe-area-top', Math.max(safe.top || 0, content.top || 0));

  setPixelVariable('--tg-safe-area-right', Math.max(safe.right || 0, content.right || 0));

  setPixelVariable('--tg-safe-area-bottom', Math.max(safe.bottom || 0, content.bottom || 0));

  setPixelVariable('--tg-safe-area-left', Math.max(safe.left || 0, content.left || 0));
}

function syncViewport(tg: TelegramWebApp) {
  if (typeof document === 'undefined') return;

  const stableHeight =
    tg.viewportStableHeight ||
    tg.viewportHeight ||
    (typeof window !== 'undefined' ? window.innerHeight : 0);

  if (!stableHeight || stableHeight <= 0) return;

  document.documentElement.style.setProperty('--tg-viewport-stable-height', `${stableHeight}px`);

  document.documentElement.style.setProperty(
    '--tg-viewport-height',
    `${tg.viewportHeight || stableHeight}px`
  );
}

export default function TelegramMiniApp() {
  const pathname = usePathname() || '';
  const router = useRouter();
  const isTelegram = useIsTelegram();

  useEffect(() => {
    const ritual = isRitualRoute(pathname);

    document.body.classList.toggle('ritual-route', ritual);

    return () => {
      document.body.classList.remove('ritual-route');
    };
  }, [pathname]);

  useEffect(() => {
    if (!isTelegram) {
      document.body.classList.remove('telegram-app');

      document.documentElement.classList.remove('telegram-mini-app');

      return;
    }

    const tg = getTelegramWebApp();

    if (!tg) return;

    document.body.classList.add('telegram-app');

    document.documentElement.classList.add('telegram-mini-app');

    try {
      tg.ready?.();
    } catch {
      /* Telegram methods are optional. */
    }

    try {
      tg.expand?.();
    } catch {
      /* Telegram methods are optional. */
    }

    // Keep the native Telegram chrome aligned with the dark Temple frame.
    try {
      tg.setHeaderColor?.('#141210');
    } catch {
      /* Telegram methods are optional. */
    }

    try {
      tg.setBackgroundColor?.('#141210');
    } catch {
      /* Telegram methods are optional. */
    }

    syncSafeArea(tg);
    syncViewport(tg);

    const handleViewport = () => {
      syncViewport(tg);
    };

    const handleSafeArea = () => {
      syncSafeArea(tg);
    };

    const handleTheme = () => {
      syncSafeArea(tg);
      syncViewport(tg);
    };

    const handleResize = () => {
      syncViewport(tg);
    };

    tg.onEvent?.('viewportChanged', handleViewport);
    tg.onEvent?.('safeAreaChanged', handleSafeArea);
    tg.onEvent?.('contentSafeAreaChanged', handleSafeArea);
    tg.onEvent?.('themeChanged', handleTheme);

    window.addEventListener('resize', handleResize);

    const visualViewport = window.visualViewport;

    visualViewport?.addEventListener('resize', handleResize);

    return () => {
      tg.offEvent?.('viewportChanged', handleViewport);
      tg.offEvent?.('safeAreaChanged', handleSafeArea);
      tg.offEvent?.('contentSafeAreaChanged', handleSafeArea);
      tg.offEvent?.('themeChanged', handleTheme);

      window.removeEventListener('resize', handleResize);

      visualViewport?.removeEventListener('resize', handleResize);

      document.body.classList.remove('telegram-app');

      document.documentElement.classList.remove('telegram-mini-app');
    };
  }, [isTelegram]);

  useEffect(() => {
    if (!isTelegram) return;

    const backButton = getTelegramWebApp()?.BackButton;

    if (!backButton) return;

    const isEntryRoute = pathname === '/' || pathname === WORLD_ROUTE;

    const handleBack = () => {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
        return;
      }

      router.push(WORLD_ROUTE);
    };

    try {
      if (isEntryRoute) {
        backButton.hide?.();
      } else {
        backButton.show?.();
      }

      backButton.onClick?.(handleBack);
    } catch {
      /* Telegram BackButton is optional. */
    }

    return () => {
      try {
        backButton.offClick?.(handleBack);
        backButton.hide?.();
      } catch {
        /* Telegram BackButton is optional. */
      }
    };
  }, [isTelegram, pathname, router]);

  if (!isTelegram) return null;

  return <TelegramNavigation />;
}
