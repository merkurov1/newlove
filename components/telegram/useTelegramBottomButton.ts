'use client';

import { useEffect, useRef, useState } from 'react';

import {
  acquireBottomButton,
  type BottomButtonController,
} from '@/lib/telegram/bottomButton';

type Options = {
  text: string;
  visible: boolean;
  enabled?: boolean;
  onClick: () => void;
};

const RETRY_MIN_MS = 100;
const RETRY_MAX_MS = 2_000;
const RETRY_WINDOW_MS = 60_000;

/**
 * Keep Telegram's native primary action button (`MainButton`, with a legacy
 * `BottomButton` fallback) in sync with a route's current state.
 *
 * - one owner per mounted component;
 * - the click handler is read from a ref, so updates never leave a stale
 *   closure and never stack duplicate native listeners;
 * - acquisition is retried with bounded backoff, so a late Telegram SDK load
 *   or a temporarily busy route owner still gets the native button;
 * - everything is unregistered and hidden on unmount.
 */
export function useTelegramBottomButton({
  text,
  visible,
  enabled = true,
  onClick,
}: Options) {
  const [available, setAvailable] = useState(false);
  const controllerRef = useRef<BottomButtonController | null>(null);
  const onClickRef = useRef(onClick);
  const ownerRef = useRef<symbol | null>(null);
  const configRef = useRef({ text, visible, enabled });

  if (!ownerRef.current) ownerRef.current = Symbol('telegram-bottom-button');

  onClickRef.current = onClick;
  configRef.current = { text, visible, enabled };

  useEffect(() => {
    if (!visible) {
      setAvailable(false);
      return;
    }

    const owner = ownerRef.current;

    if (!owner) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const retryDeadline = Date.now() + RETRY_WINDOW_MS;

    const clearRetry = () => {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const applyLatest = (controller: BottomButtonController) => {
      const current = configRef.current;

      controller.update({
        text: current.text,
        visible: current.visible,
        enabled: current.enabled,
        onClick: () => onClickRef.current(),
      });
    };

    const acquire = () => {
      if (cancelled || controllerRef.current) return;

      const controller = acquireBottomButton(owner, {
        text: configRef.current.text,
        visible: false,
        enabled: configRef.current.enabled,
        onClick: () => onClickRef.current(),
      });

      if (controller) {
        controllerRef.current = controller;
        applyLatest(controller);
        setAvailable(true);
        return;
      }

      if (Date.now() >= retryDeadline) return;

      attempt += 1;

      // The SDK may load after the first render and the previous route owner
      // may still be disposing. Retry quickly at first, then settle into a
      // low-frequency poll without ever blocking the screen.
      const delay = Math.min(
        RETRY_MAX_MS,
        RETRY_MIN_MS * 2 ** Math.min(attempt, 5)
      );

      retryTimer = setTimeout(() => {
        retryTimer = null;
        acquire();
      }, delay);
    };

    const retryNow = () => {
      if (cancelled || controllerRef.current) return;

      clearRetry();
      attempt = 0;
      acquire();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') retryNow();
    };

    acquire();

    // Reopening a Mini App or returning to the tab must re-check a button that
    // was not available during the first acquisition window.
    window.addEventListener('focus', retryNow);
    window.addEventListener('pageshow', retryNow);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      clearRetry();

      window.removeEventListener('focus', retryNow);
      window.removeEventListener('pageshow', retryNow);
      document.removeEventListener('visibilitychange', handleVisibility);

      const controller = controllerRef.current;
      controllerRef.current = null;
      controller?.dispose();
      setAvailable(false);
    };
    // Acquire only when the action becomes visible. The bounded retry loop
    // covers a late SDK, so this effect must not restart on every label change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    const controller = controllerRef.current;

    if (!controller) {
      setAvailable(false);
      return;
    }

    controller.update({
      text,
      visible,
      enabled,
      onClick: () => onClickRef.current(),
    });
    setAvailable(true);
  }, [text, visible, enabled]);

  return available;
}
