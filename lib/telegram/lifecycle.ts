/**
 * Telegram Mini App lifecycle.
 *
 * One small, testable module owns the parts of the WebApp lifecycle that many
 * components depend on: `ready`/`expand`, the visual viewport, safe-area
 * insets, theme parameters and activation events. Everything is feature
 * detected and every listener is removed by the returned cleanup function, so
 * route changes and React strict-mode remounts cannot leak handlers.
 *
 * This module deliberately does not touch navigation, BackButton semantics or
 * owner permissions.
 */

import type { TelegramThemeParams, TelegramWebApp } from './webApp';

export type TelegramColorScheme = 'light' | 'dark';

export type TelegramInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  /** Insets combined with `env(safe-area-inset-*)`, for reference only. */
  maxTop: number;
  maxBottom: number;
};

export type TelegramLifecycleOptions = {
  /** Lock the vertical swipe-to-close gesture while the app is open. */
  disableVerticalSwipes?: boolean;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  onThemeChange?: (scheme: TelegramColorScheme) => void;
  onViewportChange?: () => void;
  /** Called when Telegram reports that the Mini App became inactive. */
  onDeactivate?: () => void;
  /** Called when Telegram restores an inactive Mini App. */
  onActivate?: () => void;
};

const THEME_VARIABLES: Array<[string, keyof TelegramThemeParams]> = [
  ['--tg-theme-bg-color', 'bg_color'],
  ['--tg-theme-text-color', 'text_color'],
  ['--tg-theme-hint-color', 'hint_color'],
  ['--tg-theme-link-color', 'link_color'],
  ['--tg-theme-button-color', 'button_color'],
  ['--tg-theme-button-text-color', 'button_text_color'],
  ['--tg-theme-secondary-bg-color', 'secondary_bg_color'],
  ['--tg-theme-header-bg-color', 'header_bg_color'],
  ['--tg-theme-bottom-bar-bg-color', 'bottom_bar_bg_color'],
];

const TELEGRAM_EVENTS = [
  'viewportChanged',
  'safeAreaChanged',
  'contentSafeAreaChanged',
  'themeChanged',
  'fullscreenChanged',
  'activated',
  'deactivated',
] as const;

function pixel(value: unknown): number {
  const next = Number(value);

  return Number.isFinite(next) && next > 0 ? Math.round(next) : 0;
}

/** Merge both Telegram inset objects into one defensive snapshot. */
export function readTelegramInsets(webApp?: TelegramWebApp | null): TelegramInsets {
  const safe = webApp?.safeAreaInset || {};
  const content = webApp?.contentSafeAreaInset || {};
  const top = Math.max(pixel(safe.top), pixel(content.top));
  const right = Math.max(pixel(safe.right), pixel(content.right));
  const bottom = Math.max(pixel(safe.bottom), pixel(content.bottom));
  const left = Math.max(pixel(safe.left), pixel(content.left));

  return {
    top,
    right,
    bottom,
    left,
    // The CSS keeps using `max(env(...), var(--tg-safe-area-*))`; these values
    // are exposed for layout code that needs one numeric source.
    maxTop: top,
    maxBottom: bottom,
  };
}

function setPixelVariable(name: string, value: number) {
  if (typeof document === 'undefined') return;

  document.documentElement.style.setProperty(name, `${Math.max(0, Math.round(value))}px`);
}

/** Write the safe-area contract consumed by flow.css and main.css. */
export function applyTelegramInsets(webApp?: TelegramWebApp | null): TelegramInsets {
  const insets = readTelegramInsets(webApp);

  setPixelVariable('--tg-safe-area-top', insets.top);
  setPixelVariable('--tg-safe-area-right', insets.right);
  setPixelVariable('--tg-safe-area-bottom', insets.bottom);
  setPixelVariable('--tg-safe-area-left', insets.left);

  return insets;
}

export type TelegramViewport = {
  height: number;
  stableHeight: number;
};

/**
 * Keep the layout height stable. `viewportStableHeight` is allowed to lag a
 * keyboard or a collapsing header; `viewportHeight` follows the animation.
 */
export function applyTelegramViewport(webApp?: TelegramWebApp | null): TelegramViewport | null {
  if (typeof document === 'undefined') return null;

  const height = pixel(webApp?.viewportHeight) || pixel(window.innerHeight);
  const stableHeight = pixel(webApp?.viewportStableHeight) || height;

  if (!height && !stableHeight) return null;

  document.documentElement.style.setProperty('--tg-viewport-height', `${height}px`);
  document.documentElement.style.setProperty('--tg-viewport-stable-height', `${stableHeight}px`);
  document.documentElement.style.setProperty('--tg-header-height', `${pixel(webApp?.headerHeight)}px`);

  return { height, stableHeight };
}

function hexLuminance(value?: string): number | null {
  if (typeof value !== 'string') return null;

  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (!match) return null;

  const hex =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : match[1];

  const channels = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Resolve Telegram's declared scheme, with a luminance fallback for clients
 * that omit `colorScheme` but still send `themeParams`.
 */
export function resolveTelegramColorScheme(webApp?: TelegramWebApp | null): TelegramColorScheme {
  if (webApp?.colorScheme === 'dark' || webApp?.colorScheme === 'light') {
    return webApp.colorScheme;
  }

  const luminance = hexLuminance(webApp?.themeParams?.bg_color);

  if (luminance === null) return 'light';

  return luminance < 0.45 ? 'dark' : 'light';
}

export type TelegramThemeSnapshot = {
  scheme: TelegramColorScheme;
  params: TelegramThemeParams;
};

/**
 * Publish Telegram tokens as CSS variables. Flow keeps its own editorial
 * paper/ink palette; these variables feed native chrome and semantic
 * components without silently darkening the publication.
 */
export function applyTelegramTheme(webApp?: TelegramWebApp | null): TelegramThemeSnapshot {
  const params = webApp?.themeParams || {};
  const scheme = resolveTelegramColorScheme(webApp);

  if (typeof document !== 'undefined') {
    for (const [variable, key] of THEME_VARIABLES) {
      const value = params[key];

      if (typeof value === 'string' && value.trim()) {
        document.documentElement.style.setProperty(variable, value);
      }
    }

    document.documentElement.dataset.telegramTheme = 'telegram-theme';
    document.documentElement.dataset.telegramColorScheme = scheme;
    document.documentElement.style.setProperty('--tg-color-scheme', scheme);
  }

  return { scheme, params };
}

export function syncTelegramChromeState(webApp?: TelegramWebApp | null) {
  applyTelegramTheme(webApp);
  applyTelegramInsets(webApp);

  return applyTelegramViewport(webApp);
}

function callWebAppMethod(
  webApp: TelegramWebApp | null | undefined,
  method: 'ready' | 'expand' | 'disableVerticalSwipes' | 'enableVerticalSwipes'
) {
  const call = webApp?.[method];

  if (typeof call !== 'function') return false;

  try {
    // Keep the SDK receiver: several Telegram versions bind state to it.
    call.call(webApp);
    return true;
  } catch {
    return false;
  }
}

function addListener(
  target: { addEventListener?: (type: string, listener: () => void) => void } | null | undefined,
  type: string,
  listener: () => void
) {
  try {
    target?.addEventListener?.(type, listener);
  } catch {
    /* Older WebViews may not support the event. */
  }
}

function removeListener(
  target: { removeEventListener?: (type: string, listener: () => void) => void } | null | undefined,
  type: string,
  listener: () => void
) {
  try {
    target?.removeEventListener?.(type, listener);
  } catch {
    /* Cleanup must never throw. */
  }
}

/**
 * Attach the Telegram lifecycle to one WebApp instance.
 *
 * Returns an idempotent cleanup function. Callers may reuse it on every
 * remount; the extension object itself is never mutated.
 */
export function attachTelegramLifecycle(
  webApp: TelegramWebApp | null | undefined,
  options: TelegramLifecycleOptions = {}
): () => void {
  if (!webApp || typeof window === 'undefined') return () => undefined;

  let destroyed = false;

  // The SDK documentation asks for ready() before any other UI call. Both are
  // optional on very old clients.
  callWebAppMethod(webApp, 'ready');
  callWebAppMethod(webApp, 'expand');

  if (options.disableVerticalSwipes) {
    callWebAppMethod(webApp, 'disableVerticalSwipes');
  }

  applyTelegramTheme(webApp);
  applyTelegramInsets(webApp);
  applyTelegramViewport(webApp);
  options.onThemeChange?.(resolveTelegramColorScheme(webApp));
  options.onFullscreenChange?.(Boolean(webApp.isFullscreen));

  const syncAll = () => {
    if (destroyed) return;

    applyTelegramTheme(webApp);
    applyTelegramInsets(webApp);
    applyTelegramViewport(webApp);
    options.onViewportChange?.();
  };

  const handleViewport = () => {
    if (destroyed) return;

    applyTelegramViewport(webApp);
    applyTelegramInsets(webApp);
    options.onViewportChange?.();
  };

  const handleSafeArea = () => {
    if (destroyed) return;

    applyTelegramInsets(webApp);
  };

  const handleTheme = () => {
    if (destroyed) return;

    const snapshot = applyTelegramTheme(webApp);

    options.onThemeChange?.(snapshot.scheme);
    options.onViewportChange?.();
  };

  const handleFullscreen = () => {
    if (destroyed) return;

    applyTelegramInsets(webApp);
    applyTelegramViewport(webApp);
    options.onFullscreenChange?.(Boolean(webApp.isFullscreen));
  };

  const handleActivated = () => {
    if (destroyed) return;

    syncAll();
    options.onActivate?.();
  };

  const handleDeactivated = () => {
    if (destroyed) return;

    options.onDeactivate?.();
  };

  const handlers: Record<(typeof TELEGRAM_EVENTS)[number], () => void> = {
    viewportChanged: handleViewport,
    safeAreaChanged: handleSafeArea,
    contentSafeAreaChanged: handleSafeArea,
    themeChanged: handleTheme,
    fullscreenChanged: handleFullscreen,
    activated: handleActivated,
    deactivated: handleDeactivated,
  };

  for (const event of TELEGRAM_EVENTS) {
    try {
      webApp.onEvent?.(event, handlers[event]);
    } catch {
      /* Method may be unsupported. */
    }
  }

  const handleWindowResize = () => handleViewport();

  addListener(window, 'resize', handleWindowResize);
  addListener(window, 'orientationchange', handleWindowResize);
  addListener(window.visualViewport, 'resize', handleWindowResize);

  return () => {
    if (destroyed) return;

    destroyed = true;

    for (const event of TELEGRAM_EVENTS) {
      try {
        webApp.offEvent?.(event, handlers[event]);
      } catch {
        /* Cleanup must never throw. */
      }
    }

    removeListener(window, 'resize', handleWindowResize);
    removeListener(window, 'orientationchange', handleWindowResize);
    removeListener(window.visualViewport, 'resize', handleWindowResize);

    if (options.disableVerticalSwipes) {
      callWebAppMethod(webApp, 'enableVerticalSwipes');
    }
  };
}
