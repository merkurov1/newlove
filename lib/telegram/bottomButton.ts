/**
 * Route-scoped ownership of Telegram's native BottomButton.
 *
 * Only one route may own the native button at a time. A second claimant gets
 * `null` instead of silently replacing the first screen's action, which
 * prevents duplicate native handlers and competing CTAs.
 */

import { getTelegramWebApp, type TelegramBottomButton } from './webApp';

export type BottomButtonConfig = {
  text: string;
  visible: boolean;
  enabled?: boolean;
  onClick: () => void;
};

export type BottomButtonController = {
  update: (config: BottomButtonConfig) => void;
  dispose: () => void;
};

let activeOwner: symbol | null = null;

function button(): TelegramBottomButton | null {
  const tg = getTelegramWebApp();

  return tg?.BottomButton && typeof tg.BottomButton.show === 'function'
    ? tg.BottomButton
    : null;
}

function apply(bottom: TelegramBottomButton, config: BottomButtonConfig) {
  const text = config.text.trim();

  if (!text) return;

  try {
    if (typeof bottom.setParams === 'function') {
      bottom.setParams({
        text,
        is_active: config.enabled !== false,
        is_visible: config.visible,
      });
      return;
    }

    bottom.setText?.(text);

    if (config.visible) bottom.show?.();
    else bottom.hide?.();
  } catch {
    /* Optional Telegram methods must never break the screen. */
  }
}

export function isTelegramBottomButtonSupported(): boolean {
  return button() !== null;
}

export function acquireBottomButton(
  owner: symbol,
  initial: BottomButtonConfig
): BottomButtonController | null {
  const bottom = button();

  if (!bottom) return null;
  if (activeOwner && activeOwner !== owner) return null;

  activeOwner = owner;

  let current: BottomButtonConfig = initial;
  let disposed = false;

  const handleClick = () => {
    if (disposed || !current.visible || current.enabled === false) return;

    try {
      current.onClick();
    } catch (error) {
      console.warn('[telegram] BottomButton action failed:', error);
    }
  };

  try {
    bottom.onClick?.(handleClick);
  } catch {
    /* Optional Telegram method. */
  }

  apply(bottom, current);

  return {
    update(next) {
      if (disposed) return;
      current = next;
      apply(bottom, current);
    },
    dispose() {
      if (disposed) return;
      disposed = true;

      try {
        bottom.offClick?.(handleClick);
        bottom.hide?.();
      } catch {
        /* Optional Telegram method. */
      }

      if (activeOwner === owner) activeOwner = null;
    },
  };
}

export function resetBottomButtonOwnership() {
  activeOwner = null;
}
