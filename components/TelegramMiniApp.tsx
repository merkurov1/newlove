'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import useIsTelegram from '@/components/useIsTelegram';
import TelegramNavigation from '@/components/telegram/TelegramNavigation';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import { resolveTelegramStartParam } from '@/lib/telegram/miniAppRoutes';
import {
  hasTelegramBackHandler,
  runTopTelegramBackHandler,
  subscribeTelegramBackHandlers,
} from '@/lib/telegram/backHandler';
import {
  isRitualRoute,
  isTelegramNavigationHidden,
} from '@/lib/temple/routes';

const WORLD_ROUTE = '/heartandangel/world';

type TelegramInset = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

type TelegramThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  bottom_bar_bg_color?: string;
};

type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: {
    start_param?: string;
  };
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;
  themeParams?: TelegramThemeParams;
  isExpanded?: boolean;
  isFullscreen?: boolean;
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  close?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged?: () => void;
  };
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

function applyTelegramTheme(tg: TelegramWebApp) {
  if (typeof document === 'undefined') return;

  const theme = tg.themeParams || {};
  const variables: Array<[string, string | undefined]> = [
    ['--tg-theme-bg-color', theme.bg_color],
    ['--tg-theme-text-color', theme.text_color],
    ['--tg-theme-hint-color', theme.hint_color],
    ['--tg-theme-link-color', theme.link_color],
    ['--tg-theme-button-color', theme.button_color],
    ['--tg-theme-button-text-color', theme.button_text_color],
    ['--tg-theme-secondary-bg-color', theme.secondary_bg_color],
    ['--tg-theme-header-bg-color', theme.header_bg_color],
    ['--tg-theme-bottom-bar-bg-color', theme.bottom_bar_bg_color],
  ];

  for (const [name, value] of variables) {
    if (value) document.documentElement.style.setProperty(name, value);
  }

  const colorScheme = theme.bg_color ? 'telegram-theme' : 'site-theme';
  document.documentElement.dataset.telegramTheme = colorScheme;
}

function haptic(tg: TelegramWebApp, style: 'light' | 'medium' = 'light') {
  try {
    tg.HapticFeedback?.impactOccurred?.(style);
  } catch {
    /* Haptic feedback is optional. */
  }
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
  const { mode, closeConversation } = usePierrot();
  const startParamHandledRef = useRef(false);
  const [overlayActive, setOverlayActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setOverlayActive(hasTelegramBackHandler());

    sync();

    return subscribeTelegramBackHandlers(sync);
  }, []);

  useEffect(() => {
    const ritual = isRitualRoute(pathname);

    document.body.classList.toggle('ritual-route', ritual);

    return () => {
      document.body.classList.remove('ritual-route');
    };
  }, [pathname]);

  useEffect(() => {
    if (!isTelegram) {
      setIsFullscreen(false);
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

    // Fullscreen is optional. If Telegram or the platform does not support it,
    // the expanded viewport remains the graceful fallback.
    if (!tg.isExpanded) {
      try {
        tg.requestFullscreen?.();
      } catch {
        /* Telegram methods are optional. */
      }
    }

    try {
      tg.disableVerticalSwipes?.();
    } catch {
      /* Telegram methods are optional. */
    }

    applyTelegramTheme(tg);

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

    try {
      tg.setBottomBarColor?.('#141210');
    } catch {
      /* Telegram methods are optional. */
    }

    syncSafeArea(tg);
    syncViewport(tg);
    setIsFullscreen(Boolean(tg.isFullscreen));

    const handleViewport = () => {
      syncViewport(tg);
    };

    const handleFullscreen = () => {
      setIsFullscreen(Boolean(tg.isFullscreen));
      syncSafeArea(tg);
      syncViewport(tg);
    };

    const handleSafeArea = () => {
      syncSafeArea(tg);
    };

    const handleTheme = () => {
      applyTelegramTheme(tg);
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
    tg.onEvent?.('fullscreenChanged', handleFullscreen);

    window.addEventListener('resize', handleResize);

    const visualViewport = window.visualViewport;

    visualViewport?.addEventListener('resize', handleResize);

    return () => {
      tg.offEvent?.('viewportChanged', handleViewport);
      tg.offEvent?.('safeAreaChanged', handleSafeArea);
      tg.offEvent?.('contentSafeAreaChanged', handleSafeArea);
      tg.offEvent?.('themeChanged', handleTheme);
      tg.offEvent?.('fullscreenChanged', handleFullscreen);

      window.removeEventListener('resize', handleResize);

      visualViewport?.removeEventListener('resize', handleResize);

      document.body.classList.remove('telegram-app');

      document.documentElement.classList.remove('telegram-mini-app');
    };
  }, [isTelegram]);

  useEffect(() => {
    if (!isTelegram || startParamHandledRef.current) return;

    const tg = getTelegramWebApp();
    const target = resolveTelegramStartParam(tg?.initDataUnsafe?.start_param);

    startParamHandledRef.current = true;

    if (target && target !== pathname) {
      router.replace(target);
    }
  }, [isTelegram, pathname, router]);

  useEffect(() => {
    if (!isTelegram) return;

    const tg = getTelegramWebApp();
    const backButton = tg?.BackButton;

    if (!backButton) return;

    const isEntryRoute = pathname === '/' || pathname === WORLD_ROUTE;
    const isConversationOpen = mode !== 'site';
    const shouldShowBack = !isEntryRoute || isConversationOpen || overlayActive;

    const handleBack = () => {
      if (tg) haptic(tg);

      if (runTopTelegramBackHandler()) {
        return;
      }

      if (isConversationOpen) {
        closeConversation();
        return;
      }

      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
        return;
      }

      if (pathname !== '/lobby') {
        router.push('/lobby');
        return;
      }

      try {
        tg?.close?.();
      } catch {
        router.push(WORLD_ROUTE);
      }
    };

    try {
      if (shouldShowBack) {
        backButton.show?.();
      } else {
        backButton.hide?.();
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
  }, [closeConversation, isTelegram, mode, overlayActive, pathname, router]);

  if (!isTelegram) return null;

  const isFlowRoute =
    pathname === '/flow' || pathname.startsWith('/flow/');
  const showFullscreenClose = isFullscreen && isFlowRoute;
  const navigationHidden = isTelegramNavigationHidden(pathname);

  const closeMiniApp = () => {
    const tg = getTelegramWebApp();

    if (tg) haptic(tg);

    try {
      if (tg?.close) {
        tg.close();
        return;
      }
    } catch {
      /* Fall through to browser history. */
    }

    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/lobby');
  };

  if (!showFullscreenClose && navigationHidden) {
    return null;
  }

  return (
    <>
      {showFullscreenClose && (
        <button
          type="button"
          onClick={closeMiniApp}
          aria-label="Close Mini App"
          title="Close"
          className="fixed z-[120] flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-lg backdrop-blur-md transition hover:bg-black/75 active:scale-95"
          style={{
            left: 'max(0.75rem, env(safe-area-inset-left), var(--tg-safe-area-left, 0px))',
            top: 'max(0.75rem, env(safe-area-inset-top), var(--tg-safe-area-top, 0px))',
          }}
        >
          <X size={19} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}

      {!navigationHidden && <TelegramNavigation />}
    </>
  );
}
