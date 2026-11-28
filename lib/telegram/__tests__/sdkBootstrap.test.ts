import {
  TELEGRAM_LAUNCH_KEYS,
  TELEGRAM_SDK_BOOTSTRAP,
  TELEGRAM_WEB_APP_SCRIPT_SRC,
  ensureTelegramSdk,
  isTelegramLaunchLocation,
} from '@/lib/telegram/sdkBootstrap';

describe('Telegram SDK bootstrap', () => {
  it('detects every documented Telegram launch marker', () => {
    for (const key of TELEGRAM_LAUNCH_KEYS) {
      expect(isTelegramLaunchLocation(`https://www.merkurov.love/flow#${key}=value`)).toBe(true);
      expect(isTelegramLaunchLocation(`https://www.merkurov.love/flow?${key}=value`)).toBe(true);
    }
  });

  it('never treats an ordinary browser URL as a Mini App launch', () => {
    expect(isTelegramLaunchLocation('https://www.merkurov.love/flow')).toBe(false);
    expect(isTelegramLaunchLocation('https://www.merkurov.love/flow?ref=telegram')).toBe(false);
    expect(isTelegramLaunchLocation('not a url')).toBe(false);
  });

  it('keeps the bootstrap safe: guarded, idempotent and HTTPS-only', () => {
    expect(TELEGRAM_WEB_APP_SCRIPT_SRC.startsWith('https://')).toBe(true);
    expect(TELEGRAM_SDK_BOOTSTRAP).toContain('window.Telegram');
    expect(TELEGRAM_SDK_BOOTSTRAP).toContain('document.querySelector');
    expect(TELEGRAM_SDK_BOOTSTRAP).toContain('tgWebAppData');
    expect(TELEGRAM_SDK_BOOTSTRAP).toContain('TelegramWebviewProxy');
    expect(TELEGRAM_SDK_BOOTSTRAP).not.toContain('eval(');
    expect(() => new Function(TELEGRAM_SDK_BOOTSTRAP)).not.toThrow();
  });

  it('injects the runtime fallback only once', () => {
    document.head.querySelectorAll('script[src*="telegram-web-app.js"]').forEach((node) => {
      node.remove();
    });

    ensureTelegramSdk(document);
    ensureTelegramSdk(document);

    const scripts = document.head.querySelectorAll('script[src*="telegram-web-app.js"]');

    expect(scripts).toHaveLength(1);
    expect((scripts[0] as HTMLScriptElement).src).toBe(TELEGRAM_WEB_APP_SCRIPT_SRC);
  });
});
