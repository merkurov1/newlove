'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import useIsTelegram from '@/components/useIsTelegram';
import TelegramNavigation from '@/components/telegram/TelegramNavigation';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import {
  resolveTelegramStartParam,
  readTelegramStartParamFromUrl,
} from '@/lib/telegram/miniAppRoutes';
import {
  hasTelegramBackHandler,
  runTopTelegramBackHandler,
  subscribeTelegramBackHandlers,
} from '@/lib/telegram/backHandler';
import { isRitualRoute, isTelegramNavigationHidden } from '@/lib/temple/routes';
import {
  pushTelegramNavigationRoute,
  replaceTelegramNavigationRoute,
  resolveTelegramSectionHome,
} from '@/lib/telegram/navigation';
import { resolveTelegramChrome } from '@/lib/telegram/chrome';
import { getTelegramWebApp, hapticSelection } from '@/lib/telegram/webApp';
import { attachTelegramLifecycle } from '@/lib/telegram/lifecycle';

const WORLD_ROUTE = '/heartandangel/world';

function isFlowPath(pathname: string) {
  return pathname === '/flow' || pathname.startsWith('/flow/');
}

export default function TelegramMiniApp() {
  const pathname = usePathname() || '';
  const router = useRouter();
  const isTelegram = useIsTelegram();
  const { mode, closeConversation } = usePierrot();
  const startParamHandledRef = useRef<string | null>(null);
  const navigationStackRef = useRef<string[]>([pathname || '/']);
  const previousPathRef = useRef(pathname || '/');
  const pendingReplaceRef = useRef<string | null>(null);
  const [overlayActive, setOverlayActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track only in-app route transitions. The native BackButton must not use
  // `window.history.length`: a Telegram WebView can start with a blank entry,
  // which would make "back" leave the app instead of returning to the previous
  // Flow screen. `replace` transitions do not create a new route entry.
  useEffect(() => {
    const current = pathname || '/';
    const previous = previousPathRef.current;

    if (current === previous) return;

    const replacing = pendingReplaceRef.current === current;

    if (replacing) pendingReplaceRef.current = null;

    navigationStackRef.current = replacing
      ? replaceTelegramNavigationRoute(navigationStackRef.current, current)
      : pushTelegramNavigationRoute(navigationStackRef.current, current);
    previousPathRef.current = current;
  }, [pathname]);

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

  // Reserve editorial breathing room for the fullscreen close affordance so it
  // never sits on top of the Flow masthead or the reader's back link.
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
      // The SDK is the primary source, but Telegram also passes the value as
      // `tgWebAppStartParam`. The URL fallback lets a deep link resolve before
      // a slow SDK finishes loading.
      const raw =
        tg?.initDataUnsafe?.start_param || readTelegramStartParamFromUrl(window.location.href);
      const value = typeof raw === 'string' ? raw.trim() : '';

      if (!value || startParamHandledRef.current === value) return;

      // Remember the raw value first: even an unknown/malformed payload must
      // not be retried on every focus/visibility tick.
      startParamHandledRef.current = value;

      const target = resolveTelegramStartParam(value);

      // Unknown payloads are ignored: the current first-party route is already
      // a safe destination, and an external URL is never accepted here.
      if (target && target !== pathname) {
        pendingReplaceRef.current = target;
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
    const shouldShowBack = !isEntryRoute || isConversationOpen || overlayActive;

    const handleBack = () => {
      hapticSelection();

      if (runTopTelegramBackHandler()) {
        return;
      }

      if (isConversationOpen) {
        closeConversation();
        return;
      }

      // A Flow publication opened from a cold deep link has no meaningful
      // in-app history. Go "up" to the Flow index rather than closing the Mini
      // App or jumping back to the Lobby.
      const sectionHome = resolveTelegramSectionHome(pathname);
      const stack = navigationStackRef.current;
      const previousRoute = stack.length > 1 ? stack[stack.length - 2] : null;

      if (sectionHome) {
        if (previousRoute === sectionHome) {
          router.back();
        } else {
          pendingReplaceRef.current = sectionHome;
          router.replace(sectionHome);
        }

        return;
      }

      // Only navigate back when the Mini App actually has another in-app
      // screen. Otherwise close the Mini App at its root.
      if (previousRoute) {
        router.back();
        return;
      }

      try {
        if (typeof tg?.close === 'function') {
          tg.close();
          return;
        }
      } catch {
        /* Fall through to the browser fallback. */
      }

      router.push(WORLD_ROUTE);
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

  const isFlowRoute = pathname === '/flow' || pathname.startsWith('/flow/');
  const showFullscreenClose = isFullscreen && isFlowRoute;
  const navigationHidden = isTelegramNavigationHidden(pathname);

  const closeMiniApp = () => {
    const tg = getTelegramWebApp();

    hapticSelection();

    try {
      if (tg?.close) {
        tg.close();
        return;
      }
    } catch {
      /* Fall through to in-app history. */
    }

    if (navigationStackRef.current.length > 1) {
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
