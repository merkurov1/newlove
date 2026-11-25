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

export type TelegramThemeParams = {
  bg_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  bottom_bar_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
};

export type TelegramWebApp = {
  initData?: string;
  /**
   * Launch-only metadata. Flow reads `start_param` for deep links; identity and
   * permissions always come from server-verified `initData`.
   */
  initDataUnsafe?: {
    start_param?: string;
  };
  version?: string;
  platform?: string;
  colorScheme?: 'light' | 'dark' | string;
  viewportHeight?: number;
  viewportStableHeight?: number;
  headerHeight?: number;
  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;
  themeParams?: TelegramThemeParams;
  isExpanded?: boolean;
  isFullscreen?: boolean;
  isActive?: boolean;
  isClosingConfirmationEnabled?: boolean;
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  close?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
  openLink?: (url: string) => void;
  openTelegramLink?: (url: string) => void;
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged?: () => void;
  };
  BottomButton?: TelegramBottomButton;
  BackButton?: {
    isVisible?: boolean;
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
    // `ready` exists on every client since 6.0 and says nothing about the
    // fullscreen API (Bot API 8.0). Only the method itself is evidence.
    fullscreen: typeof tg?.requestFullscreen === 'function',
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
  | 'selection'
  | 'reader-open'
  | 'reader-close'
  | 'gallery';

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

    if (kind === 'selection' || kind === 'gallery') {
      tg.HapticFeedback?.selectionChanged?.();
      return true;
    }

    // Reader open/close and ritual selection share the gentlest impact. The
    // per-kind throttle in `runHaptic` keeps scrolling or re-renders silent.
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

/** A single gentle confirmation when a reader or viewer opens/closes. */
export function hapticReader(action: 'open' | 'close') {
  return runHaptic(action === 'open' ? 'reader-open' : 'reader-close');
}

/** Discrete gallery movement only, never continuous scrolling. */
export function hapticGallery() {
  return runHaptic('gallery');
}

export function resetHapticThrottle() {
  lastHapticAt.clear();
}
