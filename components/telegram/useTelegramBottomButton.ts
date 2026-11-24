'use client';

import { useEffect, useRef, useState } from 'react';

import {
  acquireBottomButton,
  isTelegramBottomButtonSupported,
  type BottomButtonController,
} from '@/lib/telegram/bottomButton';

type Options = {
  text: string;
  visible: boolean;
  enabled?: boolean;
  onClick: () => void;
};

/**
 * Keep the Telegram BottomButton in sync with a route's current state.
 *
 * - one owner per mounted component;
 * - the click handler is read from a ref, so updates never leave a stale
 *   closure and never stack duplicate native listeners;
 * - everything is unregistered and hidden on unmount.
 */
export function useTelegramBottomButton({ text, visible, enabled = true, onClick }: Options) {
  const [available, setAvailable] = useState(false);
  const controllerRef = useRef<BottomButtonController | null>(null);
  const onClickRef = useRef(onClick);
  const ownerRef = useRef<symbol | null>(null);

  if (!ownerRef.current) ownerRef.current = Symbol('telegram-bottom-button');

  onClickRef.current = onClick;

  useEffect(() => {
    if (!visible) {
      setAvailable(false);
      return;
    }

    const owner = ownerRef.current;
    if (!owner) return;

    const controller = acquireBottomButton(owner, {
      text,
      visible: false,
      enabled,
      onClick: () => onClickRef.current(),
    });

    controllerRef.current = controller;
    setAvailable(Boolean(controller));

    return () => {
      controllerRef.current = null;
      controller?.dispose();
    };
    // Acquire only when the action becomes visible. Telegram's lazy SDK can
    // load after the first render, so gating on `visible` (which itself
    // requires the runtime) avoids a permanently unavailable controller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!isTelegramBottomButtonSupported()) {
      setAvailable(false);
      return;
    }

    setAvailable(Boolean(controllerRef.current));
  }, [visible, text, enabled]);

  useEffect(() => {
    controllerRef.current?.update({
      text,
      visible,
      enabled,
      onClick: () => onClickRef.current(),
    });
  }, [text, visible, enabled]);

  return available;
}
