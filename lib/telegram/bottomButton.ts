/**
 * Route-scoped ownership of Telegram's native primary action button.
 *
 * Only one route may own the native button at a time. A second claimant gets
 * `null` instead of silently replacing the first screen's action, which
 * prevents duplicate native handlers and competing CTAs.
 *
 * Telegram's documented API is `WebApp.MainButton`. Some custom/older WebViews
 * expose a `BottomButton` instead, so both names are accepted with MainButton
 * taking precedence.
 */

import {
  getTelegramWebApp,
  type TelegramNativeActionButton,
} from './webApp';

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

type ResolvedButton = {
  button: TelegramNativeActionButton;
  kind: 'main' | 'bottom';
};

function resolveButton(): ResolvedButton | null {
  const tg = getTelegramWebApp();

  if (!tg) return null;

  const main = tg.MainButton;

  if (
    main &&
    (typeof main.show === 'function' ||
      typeof main.setParams === 'function')
  ) {
    return { button: main, kind: 'main' };
  }

  const bottom = tg.BottomButton;

  if (
    bottom &&
    (typeof bottom.show === 'function' ||
      typeof bottom.setParams === 'function')
  ) {
    return { button: bottom, kind: 'bottom' };
  }

  return null;
}

function apply(button: TelegramNativeActionButton, config: BottomButtonConfig) {
  const text = config.text.trim();

  if (!text) return;

  const active = config.enabled !== false;

  try {
    if (typeof button.setParams === 'function') {
      button.setParams({
        text,
        is_active: active,
        is_visible: config.visible,
      });
      return;
    }

    // Older clients only expose granular methods.
    button.setText?.(text);

    if (config.visible) {
      if (active) button.enable?.();
      else button.disable?.();
      button.show?.();
    } else {
      button.hide?.();
    }
  } catch {
    /* Optional Telegram methods must never break the screen. */
  }
}

export function isTelegramBottomButtonSupported(): boolean {
  return resolveButton() !== null;
}

export function acquireBottomButton(
  owner: symbol,
  initial: BottomButtonConfig
): BottomButtonController | null {
  const resolved = resolveButton();

  if (!resolved) return null;
  if (activeOwner && activeOwner !== owner) return null;

  const { button } = resolved;

  activeOwner = owner;

  let current: BottomButtonConfig = initial;
  let disposed = false;

  const handleClick = () => {
    if (disposed || !current.visible || current.enabled === false) return;

    try {
      current.onClick();
    } catch (error) {
      console.warn('[telegram] native action failed:', error);
    }
  };

  try {
    button.onClick?.(handleClick);
  } catch {
    /* Optional Telegram method. */
  }

  apply(button, current);

  return {
    update(next) {
      if (disposed) return;
      current = next;
      apply(button, current);
    },
    dispose() {
      if (disposed) return;
      disposed = true;

      try {
        button.offClick?.(handleClick);
        button.hide?.();
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
