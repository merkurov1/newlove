'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import useIsTelegram from '@/components/useIsTelegram';
import TelegramNavigation from '@/components/telegram/TelegramNavigation';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import { resolveTelegramStartParam } from '@/lib/telegram/miniAppRoutes';
import {
  hasTelegramBackHandler,
  runTopTelegramBackHandler,
  subscribeTelegramBackHandlers,
} from '@/lib/telegram/backHandler';
import { isRitualRoute, isTelegramNavigationHidden } from '@/lib/temple/routes';
import { resolveTelegramChrome } from '@/lib/telegram/chrome';
import { getTelegramWebApp, hapticSelection } from '@/lib/telegram/webApp';
import { attachTelegramLifecycle } from '@/lib/telegram/lifecycle';

const WORLD_ROUTE = '/heartandangel/world';

function normalizePath(pathname: string) {
  return pathname.replace(/\/$/, '') || '/';
}

function isFlowPath(pathname: string) {
  const path = normalizePath(pathname);

  return path === '/flow' || path.startsWith('/flow/');
}

function isFlowFeedPath(pathname: string) {
  return normalizePath(pathname) === '/flow';
}

function isFlowPublicationPath(pathname: string) {
  return normalizePath(pathname).startsWith('/flow/');
}

export default function TelegramMiniApp() {
  const pathname = usePathname() || '';
  const router = useRouter();
  const isTelegram = useIsTelegram();
  const { mode, closeConversation } = usePierrot();
  const startParamHandledRef = useRef<string | null>(null);
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

    setIsFullscreen(Boolean(tg.isFullscreen));

    const detach = attachTelegramLifecycle(tg, {
      disableVerticalSwipes: true,
      onFullscreenChange: (value) => setIsFullscreen(value),
    });

    return () => {
      detach();

      document.body.classList.remove('telegram-app');

      document.documentElement.classList.remove('telegram-mini-app');
    };
  }, [isTelegram]);

  // Flow is the one surface that asks for the immersive viewport. Every other
  // route keeps Telegram's normal chrome, and unsupported clients simply stay
  // expanded. Leaving Flow restores the standard shell.
  useEffect(() => {
    if (!isTelegram) return;

    const tg = getTelegramWebApp();

    if (!tg) return;

    try {
      if (isFlowPath(pathname)) {
        if (typeof tg.requestFullscreen === 'function' && !tg.isFullscreen) {
          tg.requestFullscreen();
        }
      } else if (typeof tg.exitFullscreen === 'function' && tg.isFullscreen) {
        tg.exitFullscreen();
      }
    } catch {
      /* Fullscreen is optional; the expanded viewport is the fallback. */
    }
  }, [isTelegram, pathname]);

  // Reserve editorial breathing room for Telegram's native fullscreen close
  // control and BackButton so they never sit on top of the Flow masthead or
  // the reader's back link.
  useEffect(() => {
    const active = isTelegram && isFullscreen && isFlowPath(pathname);

    document.body.classList.toggle('telegram-fullscreen-close', active);

    return () => document.body.classList.remove('telegram-fullscreen-close');
  }, [isFullscreen, isTelegram, pathname]);

  // Native chrome is route-scoped: the always-light Temple/Flow surfaces get a
  // light header, background and bottom bar; every other route keeps the
  // existing shell colour.
  useEffect(() => {
    if (!isTelegram) return;

    const tg = getTelegramWebApp();

    if (!tg) return;

    const chrome = resolveTelegramChrome(pathname);

    document.documentElement.dataset.telegramChrome = chrome.tone;

    try {
      tg.setHeaderColor?.(chrome.colors.header);
    } catch {
      /* Telegram methods are optional. */
    }

    try {
      tg.setBackgroundColor?.(chrome.colors.background);
    } catch {
      /* Telegram methods are optional. */
    }

    try {
      tg.setBottomBarColor?.(chrome.colors.bottomBar);
    } catch {
      /* Telegram methods are optional. */
    }

    return () => {
      delete document.documentElement.dataset.telegramChrome;
    };
  }, [isTelegram, pathname]);

  useEffect(() => {
    if (!isTelegram) return;

    const handleStartParam = () => {
      const tg = getTelegramWebApp();
      const raw = tg?.initDataUnsafe?.start_param;
      const value = typeof raw === 'string' ? raw.trim() : '';

      if (!value || startParamHandledRef.current === value) return;

      // Remember the raw value first: even an unknown/malformed payload must
      // not be retried on every focus/visibility tick.
      startParamHandledRef.current = value;

      const target = resolveTelegramStartParam(value);

      // Unknown payloads safely fall back to the Temple home only when the
      // current route is not already a valid first-party destination.
      if (target && target !== pathname) {
        router.replace(target);
      }
    };

    handleStartParam();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleStartParam();
    };

    window.addEventListener('focus', handleStartParam);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleStartParam);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isTelegram, pathname, router]);

  useEffect(() => {
    if (!isTelegram) return;

    const tg = getTelegramWebApp();
    const backButton = tg?.BackButton;

    if (!backButton) return;

    const isEntryRoute = pathname === '/' || pathname === WORLD_ROUTE;
    const isConversationOpen = mode !== 'site';
    // The Flow feed is the entry surface of the editorial Mini App. Telegram
    // already provides its own close control there, so a second route-level
    // BackButton would duplicate it. Publications keep Back so the reader can
    // return to the feed instead of closing the Mini App.
    const isFlowFeed = isFlowFeedPath(pathname);
    const isFlowPublication = isFlowPublicationPath(pathname);
    const shouldShowBack = !isFlowFeed && (!isEntryRoute || isConversationOpen || overlayActive);

    const handleBack = () => {
      hapticSelection();

      // Dialogs, the image viewer and the navigation sheet are the topmost
      // surfaces. They must consume Back before any route navigation.
      if (runTopTelegramBackHandler()) {
        return;
      }

      if (isConversationOpen) {
        closeConversation();
        return;
      }

      // A Flow publication always returns to the feed, regardless of the
      // browser history stack or the route the Mini App was launched from.
      if (isFlowPublication) {
        router.push('/flow');
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

  const navigationHidden = isTelegramNavigationHidden(pathname);

  if (navigationHidden) {
    return null;
  }

  return <TelegramNavigation />;
}
