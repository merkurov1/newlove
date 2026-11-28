/**
 * Early Telegram WebApp SDK loader.
 *
 * Telegram's documentation asks for `telegram-web-app.js` to be placed in the
 * document head before any other scripts. Loading it with `lazyOnload` delayed
 * `WebApp.ready()` until the browser was idle, which kept Telegram's loading
 * placeholder on screen and postponed fullscreen/safe-area setup.
 *
 * The site is also a normal public website, so an unconditional blocking
 * third-party request on every page would be a real regression. Telegram always
 * appends launch parameters to the URL (`tgWebAppData`, `tgWebAppVersion`,
 * `tgWebAppPlatform`, `tgWebAppThemeParams` and, for direct links,
 * `tgWebAppStartParam`), and its older WebViews expose `TelegramWebviewProxy`.
 *
 * The bootstrap below queues the SDK through Next.js' own before-interactive
 * loader (`self.__next_s`) only when one of those markers is present. Using
 * Next's queue keeps the server/client head in sync, loads the script before
 * hydration, and avoids the hydration mismatch that a parser-time
 * `document.write` injects into the head.
 *
 * Runtime detection in `lib/telegram/detection.ts` remains the safety net for a
 * blocked or late bootstrap.
 */

export const TELEGRAM_WEB_APP_SCRIPT_SRC = 'https://telegram.org/js/telegram-web-app.js';

export const TELEGRAM_WEB_APP_SCRIPT_ID = 'telegram-web-app-sdk';

export const TELEGRAM_LAUNCH_KEYS = [
  'tgWebAppData',
  'tgWebAppVersion',
  'tgWebAppPlatform',
  'tgWebAppThemeParams',
  'tgWebAppStartParam',
] as const;

function readLaunchParams(href: string): URLSearchParams | null {
  try {
    const url = new URL(href, 'https://www.merkurov.love');
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    const search = url.search.startsWith('?') ? url.search.slice(1) : url.search;

    return new URLSearchParams([search, hash].filter(Boolean).join('&'));
  } catch {
    return null;
  }
}

/**
 * True when the current URL carries Telegram's launch markers. Pure so the
 * behaviour can be unit-tested without a Telegram client.
 */
export function isTelegramLaunchLocation(href: string): boolean {
  const params = readLaunchParams(href);

  if (!params) return false;

  return TELEGRAM_LAUNCH_KEYS.some((key) => params.has(key));
}

/**
 * Synchronous bootstrap rendered inside the server `<head>`.
 *
 * It only queues the SDK; Next.js starts loading queued before-interactive
 * scripts before hydration. It never runs in a normal browser and it never
 * overwrites an SDK that is already present.
 */
export const TELEGRAM_SDK_BOOTSTRAP = `(function(){try{var t=window.Telegram;if(t&&t.WebApp)return;if(document.querySelector('script[src*="telegram-web-app.js"]'))return;var u=window.location;var p=new URLSearchParams([u.search.replace(/^\\?/,""),u.hash.replace(/^#/,"")].filter(Boolean).join("&"));var k=${JSON.stringify(
  TELEGRAM_LAUNCH_KEYS
)};var found=false;for(var i=0;i<k.length;i++){if(p.has(k[i])){found=true;break}}if(!found&&!window.TelegramWebviewProxy&&!window.TelegramWebviewProxyProto)return;(self.__next_s=self.__next_s||[]).push(["${TELEGRAM_WEB_APP_SCRIPT_SRC}",{"id":"${TELEGRAM_WEB_APP_SCRIPT_ID}"}])}catch(e){}})();`;

/**
 * Runtime fallback used by detection when the head bootstrap did not run (for
 * example, a client that blocks the before-interactive queue). It is
 * idempotent and only called for URLs with Telegram launch markers.
 */
export function ensureTelegramSdk(
  doc: Document | null = typeof document === 'undefined' ? null : document
) {
  if (!doc || doc.querySelector('script[src*="telegram-web-app.js"]')) return;

  const script = doc.createElement('script');

  script.src = TELEGRAM_WEB_APP_SCRIPT_SRC;
  script.async = true;
  script.id = TELEGRAM_WEB_APP_SCRIPT_ID;
  script.dataset.telegramSdkFallback = 'true';
  doc.head?.appendChild(script);
}
