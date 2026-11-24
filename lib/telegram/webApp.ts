/**
 * Small, dependency-free Telegram WebApp accessor with runtime capability
 * detection. Telegram clients differ by version and platform, so every call
 * site must feature-detect instead of assuming an SDK method exists.
 *
 * Nothing here reads `initDataUnsafe` for identity. The only use of the raw
 * `initData` string in this module is to expose it for server verification.
 */

export type TelegramInset = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export type TelegramBottomButton = {
  isVisible?: boolean;
  show?: () => void;
  hide?: () => void;
  setText?: (text: string) => void;
  setParams?: (params: { text?: string; is_active?: boolean; is_visible?: boolean }) => void;
  onClick?: (handler: () => void) => void;
  offClick?: (handler: () => void) => void;
};

export type TelegramWebApp = {
  initData?: string;
  version?: string;
  platform?: string;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;
  isExpanded?: boolean;
  isFullscreen?: boolean;
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
  openLink?: (url: string) => void;
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged?: () => void;
  };
  BottomButton?: TelegramBottomButton;
  BackButton?: {
    show?: () => void;
    hide?: () => void;
    onClick?: (handler: () => void) => void;
    offClick?: (handler: () => void) => void;
  };
  shareToStory?: (mediaUrl: string, params?: { text?: string; widget_link?: { url: string; name?: string } }) => void;
  shareMessage?: (messageId: string, callback?: (sent: boolean) => void) => void;
  checkHomeScreenStatus?: (callback?: (status: string) => void) => void;
  addToHomeScreen?: (callback?: (status: string) => void) => void;
};

type TelegramWindow = Window & {
  Telegram?: { WebApp?: TelegramWebApp };
};

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;

  const webApp = (window as TelegramWindow).Telegram?.WebApp;

  return webApp && typeof webApp === 'object' ? webApp : null;
}

/** Raw signed launch data for the server verifier. Never `initDataUnsafe`. */
export function getTelegramInitData(): string {
  if (typeof window === 'undefined') return '';

  const value = getTelegramWebApp()?.initData;

  return typeof value === 'string' ? value : '';
}

export function isTelegramRuntime(): boolean {
  return getTelegramInitData().length > 0;
}

/** Parse Telegram's `major.minor` version string without throwing. */
export function parseTelegramVersion(version: unknown): [number, number] | null {
  if (typeof version !== 'string') return null;

  const match = version.trim().match(/^(\d+)(?:\.(\d+))?/);

  if (!match) return null;

  return [Number(match[1]), Number(match[2] ?? 0)];
}

export function isTelegramVersionAtLeast(version: unknown, minimum: string): boolean {
  const current = parseTelegramVersion(version);
  const target = parseTelegramVersion(minimum);

  if (!current || !target) return false;

  return current[0] > target[0] || (current[0] === target[0] && current[1] >= target[1]);
}

export type TelegramCapabilities = {
  bottomButton: boolean;
  haptics: boolean;
  shareToStory: boolean;
  shareMessage: boolean;
  homeScreen: boolean;
  backButton: boolean;
  fullscreen: boolean;
};

export function detectTelegramCapabilities(webApp?: TelegramWebApp | null): TelegramCapabilities {
  const tg = webApp === undefined ? getTelegramWebApp() : webApp;

  return {
    bottomButton: typeof tg?.BottomButton?.show === 'function',
    haptics: Boolean(
      tg?.HapticFeedback &&
        (typeof tg.HapticFeedback.impactOccurred === 'function' ||
          typeof tg.HapticFeedback.notificationOccurred === 'function')
    ),
    shareToStory: typeof tg?.shareToStory === 'function',
    shareMessage: typeof tg?.shareMessage === 'function',
    homeScreen:
      typeof tg?.checkHomeScreenStatus === 'function' && typeof tg?.addToHomeScreen === 'function',
    backButton: typeof tg?.BackButton?.show === 'function',
    fullscreen: typeof tg?.ready === 'function',
  };
}

export function safeTelegramCall<T>(call: (() => T) | undefined | null): T | null {
  if (typeof call !== 'function') return null;

  try {
    return call();
  } catch {
    return null;
  }
}

const lastHapticAt = new Map<string, number>();

/** Haptic throttle prevents repeated render-triggered vibrations. */
export const HAPTIC_MIN_INTERVAL_MS = 350;

export type HapticKind =
  | 'ritual-select'
  | 'vigil'
  | 'success'
  | 'error'
  | 'selection';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;

  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function runHaptic(kind: HapticKind, now = Date.now()): boolean {
  // Accessibility: a user who asked for reduced motion also gets a calmer
  // device. Haptics are always optional and never part of a flow.
  if (prefersReducedMotion()) return false;

  const previous = lastHapticAt.get(kind) ?? 0;

  if (now - previous < HAPTIC_MIN_INTERVAL_MS) return false;

  const tg = getTelegramWebApp();

  if (!tg) return false;

  lastHapticAt.set(kind, now);

  try {
    if (kind === 'vigil') {
      tg.HapticFeedback?.impactOccurred?.('medium');
      return true;
    }

    if (kind === 'success') {
      tg.HapticFeedback?.notificationOccurred?.('success');
      return true;
    }

    if (kind === 'error') {
      tg.HapticFeedback?.notificationOccurred?.('error');
      return true;
    }

    if (kind === 'selection') {
      tg.HapticFeedback?.selectionChanged?.();
      return true;
    }

    tg.HapticFeedback?.impactOccurred?.('light');
    return true;
  } catch {
    return false;
  }
}

/** Only call from genuine user actions or confirmed outcomes. */
export function hapticImpact(kind: 'ritual-select' | 'vigil' = 'ritual-select') {
  return runHaptic(kind);
}

export function hapticSelection() {
  return runHaptic('selection');
}

export function hapticNotification(kind: 'success' | 'error') {
  return runHaptic(kind);
}

export function resetHapticThrottle() {
  lastHapticAt.clear();
}
