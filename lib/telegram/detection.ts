'use client';

import { useEffect, useState } from 'react';

/**
 * Deterministic Telegram Mini App detection for the browser.
 *
 * The SDK is loaded with `next/script` (`lazyOnload`), so it can appear before
 * or after hydration. Detection therefore combines the SDK's `load` event, a
 * single shared readiness store and a bounded-backoff safety poll. There is no
 * fixed three-second cutoff: a late SDK or late initData is still picked up.
 *
 * `initDataUnsafe` is deliberately not read here. It is client-controlled and
 * can never be evidence of identity. Only the raw, signed `initData` string is
 * exposed for the server verifier.
 */

export type TelegramEnvironmentStatus = 'detecting' | 'telegram' | 'browser';

export type TelegramEnvironment = {
  status: TelegramEnvironmentStatus;
  isTelegram: boolean;
  /** Raw signed launch data. Never displayed or trusted client-side. */
  initData: string;
  /** Telegram shell detected, but initData has not arrived yet. */
  initDataPending: boolean;
  sdkReady: boolean;
  platform: string | null;
};

type TelegramWebApp = {
  initData?: string;
  platform?: string;
};

type TelegramWindow = Window & {
  Telegram?: { WebApp?: TelegramWebApp };
  TelegramWebviewProxy?: unknown;
  TelegramWebviewProxyProto?: unknown;
};

const DETECTING_SNAPSHOT: TelegramEnvironment = Object.freeze({
  status: 'detecting',
  isTelegram: false,
  initData: '',
  initDataPending: false,
  sdkReady: false,
  platform: null,
});

const SCRIPT_SELECTOR = 'script[src*="telegram-web-app.js"]';
const POLL_BASE_MS = 50;
const POLL_MAX_MS = 1_000;
// The real SDK always reports `platform` (`unknown` in a normal browser), but
// older/partial builds can leave it empty. Give such an SDK a short settling
// window before calling it a browser, while the shared poll keeps watching for
// initData after that. This is only a fallback; real browsers report
// `platform: "unknown"` and resolve immediately.
const WEBAPP_INIT_GRACE_MS = 10_000;

type SdkLoadState = 'unknown' | 'loaded' | 'error';

let snapshot: TelegramEnvironment = DETECTING_SNAPSHOT;
let sdkLoadState: SdkLoadState = 'unknown';
let webAppFirstSeenAt: number | null = null;

let watcherStarted = false;
let pollTimer: number | null = null;
let pollDelay = POLL_BASE_MS;
let observer: MutationObserver | null = null;
let observedScripts = new WeakSet<HTMLScriptElement>();

const listeners = new Set<() => void>();

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;

  const webApp = (window as TelegramWindow).Telegram?.WebApp;

  return webApp && typeof webApp === 'object' ? webApp : null;
}

function readInitData(webApp: TelegramWebApp | null): string {
  return typeof webApp?.initData === 'string' ? webApp.initData : '';
}

function hasTelegramLaunchParams(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const search = window.location.search.startsWith('?')
      ? window.location.search.slice(1)
      : window.location.search;
    const params = new URLSearchParams([hash, search].filter(Boolean).join('&'));

    return (
      params.has('tgWebAppData') ||
      params.has('tgWebAppVersion') ||
      params.has('tgWebAppPlatform') ||
      params.has('tgWebAppThemeParams')
    );
  } catch {
    return false;
  }
}

function hasTelegramBridge(): boolean {
  if (typeof window === 'undefined') return false;

  const candidate = window as TelegramWindow;

  return (
    typeof candidate.TelegramWebviewProxy !== 'undefined' ||
    typeof candidate.TelegramWebviewProxyProto !== 'undefined'
  );
}

function isTelegramPlatform(platform: string | null): boolean {
  if (!platform) return false;

  return platform.trim().toLowerCase() !== 'unknown';
}

/**
 * Pure-ish detection for the current browser environment. Exported for tests;
 * components should use `useTelegramEnvironment` so all call sites share one
 * readiness store and one poll.
 */
export function detectTelegramEnvironment(): TelegramEnvironment {
  if (typeof window === 'undefined') return DETECTING_SNAPSHOT;

  const webApp = getTelegramWebApp();
  const initData = readInitData(webApp);
  const platform =
    typeof webApp?.platform === 'string' && webApp.platform.trim() ? webApp.platform.trim() : null;
  const sdkReady = Boolean(webApp) || sdkLoadState !== 'unknown';

  if (webApp) {
    webAppFirstSeenAt ??= Date.now();
  } else {
    webAppFirstSeenAt = null;
  }

  const telegramShell =
    hasTelegramLaunchParams() || hasTelegramBridge() || isTelegramPlatform(platform);

  if (initData) {
    return {
      status: 'telegram',
      isTelegram: true,
      initData,
      initDataPending: false,
      sdkReady,
      platform,
    };
  }

  if (telegramShell) {
    return {
      status: 'telegram',
      isTelegram: true,
      initData: '',
      initDataPending: true,
      sdkReady,
      platform,
    };
  }

  // A fully initialized SDK in an ordinary browser reports platform
  // "unknown", so there is nothing to wait for.
  if (sdkReady && (platform !== null || sdkLoadState !== 'unknown')) {
    return {
      status: 'browser',
      isTelegram: false,
      initData: '',
      initDataPending: false,
      sdkReady,
      platform,
    };
  }

  if (webApp && platform === null) {
    const seenAt = webAppFirstSeenAt ?? Date.now();

    if (Date.now() - seenAt >= WEBAPP_INIT_GRACE_MS) {
      return {
        status: 'browser',
        isTelegram: false,
        initData: '',
        initDataPending: false,
        sdkReady,
        platform,
      };
    }
  }

  return {
    status: 'detecting',
    isTelegram: false,
    initData: '',
    initDataPending: false,
    sdkReady,
    platform,
  };
}

function sameEnvironment(left: TelegramEnvironment, right: TelegramEnvironment): boolean {
  return (
    left.status === right.status &&
    left.initData === right.initData &&
    left.initDataPending === right.initDataPending &&
    left.sdkReady === right.sdkReady &&
    left.platform === right.platform
  );
}

function clearPoll() {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function schedulePoll() {
  if (!watcherStarted || listeners.size === 0) return;

  clearPoll();
  pollTimer = window.setTimeout(() => {
    pollTimer = null;
    evaluate();
  }, pollDelay);
  pollDelay = Math.min(POLL_MAX_MS, Math.max(POLL_BASE_MS, pollDelay * 2));
}

function evaluate() {
  const next = detectTelegramEnvironment();
  const changed = !sameEnvironment(snapshot, next);

  if (changed) {
    snapshot = next;

    for (const listener of Array.from(listeners)) {
      listener();
    }
  }

  // Once the signed initData is present the session is authoritative and no
  // further polling is needed. Otherwise keep a low-frequency, backoff poll so
  // a late SDK/initData is still detected. It is a single shared timer and it
  // is always cleared when the last subscriber unmounts.
  if (snapshot.status === 'telegram' && snapshot.initData) {
    clearPoll();
    pollDelay = POLL_BASE_MS;
    return;
  }

  if (changed) {
    pollDelay = POLL_BASE_MS;
  }

  schedulePoll();
}

function handleEnvironmentEvent() {
  pollDelay = POLL_BASE_MS;
  evaluate();
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    handleEnvironmentEvent();
  }
}

function markScript(script: HTMLScriptElement) {
  if (observedScripts.has(script)) return;

  observedScripts.add(script);

  script.addEventListener('load', () => {
    sdkLoadState = 'loaded';
    handleEnvironmentEvent();
  });
  script.addEventListener('error', () => {
    sdkLoadState = 'error';
    handleEnvironmentEvent();
  });
}

function scanForScripts(root: ParentNode = document) {
  for (const script of Array.from(root.querySelectorAll(SCRIPT_SELECTOR))) {
    markScript(script as HTMLScriptElement);
  }
}

function startWatcher() {
  if (watcherStarted || typeof window === 'undefined') return;

  watcherStarted = true;
  observedScripts = new WeakSet<HTMLScriptElement>();
  pollDelay = POLL_BASE_MS;

  window.addEventListener('focus', handleEnvironmentEvent);
  window.addEventListener('pageshow', handleEnvironmentEvent);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  scanForScripts();

  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLScriptElement) {
            if (node.matches(SCRIPT_SELECTOR)) markScript(node);
          } else if (node instanceof Element) {
            scanForScripts(node);
          }
        }
      }

      handleEnvironmentEvent();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // The script may already have loaded before this component mounted. The
  // webApp object itself marks the SDK as ready; `load`/`error` events cover a
  // script that fails to expose it.
  evaluate();
}

function stopWatcher() {
  watcherStarted = false;
  clearPoll();
  pollDelay = POLL_BASE_MS;

  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', handleEnvironmentEvent);
    window.removeEventListener('pageshow', handleEnvironmentEvent);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  observer?.disconnect();
  observer = null;
  observedScripts = new WeakSet<HTMLScriptElement>();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  startWatcher();
  evaluate();

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      stopWatcher();
    }
  };
}

export function getTelegramEnvironmentSnapshot(): TelegramEnvironment {
  return snapshot;
}

/** Current raw signed initData, read synchronously by identity refreshes. */
export function readTelegramInitData(): string {
  return readInitData(getTelegramWebApp());
}

/** True once the environment is known to be a Telegram Mini App. */
export function isTelegramMiniApp(): boolean {
  return detectTelegramEnvironment().status === 'telegram';
}

/**
 * Shared readiness state for every component that needs Telegram detection.
 * The first client render stays aligned with SSR; the store resolves in an
 * effect and then pushes updates to all subscribers.
 */
export function useTelegramEnvironment(): TelegramEnvironment {
  const [environment, setEnvironment] = useState<TelegramEnvironment>(DETECTING_SNAPSHOT);

  useEffect(() => {
    const update = () => setEnvironment(getTelegramEnvironmentSnapshot());

    update();

    return subscribe(update);
  }, []);

  return environment;
}

export default function useIsTelegram(): boolean {
  return useTelegramEnvironment().isTelegram;
}

/** Test-only reset; keeps each Jest case isolated without leaking timers. */
export function __resetTelegramEnvironmentForTests() {
  stopWatcher();
  listeners.clear();
  snapshot = DETECTING_SNAPSHOT;
  sdkLoadState = 'unknown';
  webAppFirstSeenAt = null;
}

/** Test-only synchronous re-evaluation after mutating window.Telegram. */
export function __refreshTelegramEnvironmentForTests() {
  handleEnvironmentEvent();
}
