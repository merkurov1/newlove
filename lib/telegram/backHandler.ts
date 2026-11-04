'use client';

type TelegramBackHandler = () => boolean;

/**
 * Small client-side stack for overlays that should consume Telegram's native
 * BackButton before the router does. Pages register a handler while a modal or
 * panel is open; TelegramMiniApp checks the stack first.
 */
const handlers: TelegramBackHandler[] = [];
const listeners = new Set<() => void>();

function notifyHandlersChanged() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A listener must never break overlay registration.
    }
  }
}

export function registerTelegramBackHandler(
  handler: TelegramBackHandler
): () => void {
  handlers.push(handler);
  notifyHandlersChanged();

  return () => {
    const index = handlers.lastIndexOf(handler);

    if (index >= 0) {
      handlers.splice(index, 1);
      notifyHandlersChanged();
    }
  };
}

export function hasTelegramBackHandler(): boolean {
  return handlers.length > 0;
}

export function subscribeTelegramBackHandlers(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function runTopTelegramBackHandler(): boolean {
  for (let index = handlers.length - 1; index >= 0; index -= 1) {
    try {
      if (handlers[index]()) {
        return true;
      }
    } catch (error) {
      console.warn('Telegram back handler failed:', error);
    }
  }

  return false;
}
