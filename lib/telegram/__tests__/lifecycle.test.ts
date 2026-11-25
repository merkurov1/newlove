/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  applyTelegramInsets,
  applyTelegramTheme,
  applyTelegramViewport,
  attachTelegramLifecycle,
  readTelegramInsets,
  resolveTelegramColorScheme,
} from '../lifecycle';
import type { TelegramWebApp } from '../webApp';

type Harness = {
  webApp: TelegramWebApp;
  handlers: Map<string, () => void>;
  ready: jest.Mock;
  expand: jest.Mock;
  disableVerticalSwipes: jest.Mock;
  enableVerticalSwipes: jest.Mock;
  offEvent: jest.Mock;
};

function harness(overrides: Partial<TelegramWebApp> = {}): Harness {
  const handlers = new Map<string, () => void>();
  const ready = jest.fn();
  const expand = jest.fn();
  const disableVerticalSwipes = jest.fn();
  const enableVerticalSwipes = jest.fn();
  const offEvent = jest.fn();

  const webApp: TelegramWebApp = {
    ready,
    expand,
    disableVerticalSwipes,
    enableVerticalSwipes,
    onEvent: (event, handler) => handlers.set(event, handler),
    offEvent,
    viewportHeight: 700,
    viewportStableHeight: 812,
    safeAreaInset: { top: 47, bottom: 34, left: 0, right: 0 },
    contentSafeAreaInset: { top: 52, bottom: 20 },
    colorScheme: 'dark',
    themeParams: { bg_color: '#141210', text_color: '#f5f0e8' },
    ...overrides,
  };

  return { webApp, handlers, ready, expand, disableVerticalSwipes, enableVerticalSwipes, offEvent };
}

beforeEach(() => {
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-telegram-theme');
  document.documentElement.removeAttribute('data-telegram-color-scheme');
});

afterEach(() => {
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-telegram-theme');
  document.documentElement.removeAttribute('data-telegram-color-scheme');
});

describe('Telegram lifecycle', () => {
  it('merges safe-area and content insets with a defensive zero fallback', () => {
    const { webApp } = harness();

    expect(readTelegramInsets(webApp)).toMatchObject({
      top: 52,
      bottom: 34,
      left: 0,
      right: 0,
    });

    expect(readTelegramInsets(null)).toMatchObject({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it('writes viewport and inset CSS variables without requiring newer APIs', () => {
    const { webApp } = harness();

    applyTelegramInsets(webApp);
    const viewport = applyTelegramViewport(webApp);

    expect(viewport).toEqual({ height: 700, stableHeight: 812 });
    expect(document.documentElement.style.getPropertyValue('--tg-safe-area-top')).toBe('52px');
    expect(document.documentElement.style.getPropertyValue('--tg-safe-area-bottom')).toBe('34px');
    expect(document.documentElement.style.getPropertyValue('--tg-viewport-stable-height')).toBe(
      '812px'
    );
  });

  it('maps Telegram themes to semantic state without inventing a dark Flow palette', () => {
    const { webApp } = harness();

    const snapshot = applyTelegramTheme(webApp);

    expect(snapshot.scheme).toBe('dark');
    expect(document.documentElement.dataset.telegramTheme).toBe('telegram-theme');
    expect(document.documentElement.dataset.telegramColorScheme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--tg-theme-bg-color')).toBe('#141210');
  });

  it('falls back to background luminance when colorScheme is missing', () => {
    expect(resolveTelegramColorScheme({ themeParams: { bg_color: '#000000' } })).toBe('dark');
    expect(resolveTelegramColorScheme({ themeParams: { bg_color: '#ffffff' } })).toBe('light');
    expect(resolveTelegramColorScheme({})).toBe('light');
  });

  it('initializes once and removes every listener on cleanup', () => {
    const { webApp, handlers, ready, expand, disableVerticalSwipes, enableVerticalSwipes, offEvent } =
      harness();
    const fullscreen = jest.fn();

    const detach = attachTelegramLifecycle(webApp, {
      disableVerticalSwipes: true,
      onFullscreenChange: fullscreen,
    });

    expect(ready).toHaveBeenCalledTimes(1);
    expect(expand).toHaveBeenCalledTimes(1);
    expect(disableVerticalSwipes).toHaveBeenCalledTimes(1);
    expect(fullscreen).toHaveBeenLastCalledWith(false);
    expect(handlers.size).toBeGreaterThanOrEqual(7);

    handlers.get('fullscreenChanged')?.();

    expect(fullscreen).toHaveBeenLastCalledWith(false);

    (webApp as TelegramWebApp).isFullscreen = true;
    handlers.get('fullscreenChanged')?.();

    expect(fullscreen).toHaveBeenLastCalledWith(true);

    detach();
    detach(); // idempotent

    expect(offEvent).toHaveBeenCalledWith('viewportChanged', expect.any(Function));
    expect(offEvent).toHaveBeenCalledWith('themeChanged', expect.any(Function));
    expect(enableVerticalSwipes).toHaveBeenCalledTimes(1);
  });

  it('reports activation and deactivation without leaking state', () => {
    const { webApp, handlers } = harness();
    const activate = jest.fn();
    const deactivate = jest.fn();

    const detach = attachTelegramLifecycle(webApp, {
      onActivate: activate,
      onDeactivate: deactivate,
    });

    handlers.get('activated')?.();
    handlers.get('deactivated')?.();

    expect(activate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledTimes(1);

    detach();
  });

  it('is a no-op in the browser or with a partial SDK', () => {
    expect(() => attachTelegramLifecycle(null)()).not.toThrow();

    const partial = harness({
      ready: undefined,
      expand: undefined,
      onEvent: undefined,
      offEvent: undefined,
    });

    expect(() => {
      const detach = attachTelegramLifecycle(partial.webApp, { disableVerticalSwipes: true });

      detach();
    }).not.toThrow();
  });
});
