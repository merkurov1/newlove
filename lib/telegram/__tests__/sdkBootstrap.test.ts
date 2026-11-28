import {
  TELEGRAM_LAUNCH_KEYS,
  TELEGRAM_SDK_BOOTSTRAP,
  TELEGRAM_WEB_APP_SCRIPT_ID,
  TELEGRAM_WEB_APP_SCRIPT_SRC,
  ensureTelegramSdk,
  isTelegramLaunchLocation,
} from '@/lib/telegram/sdkBootstrap';

type TelegramTestWindow = Window & {
  Telegram?: { WebApp?: { initData?: string } };
  __next_s?: Array<[string, { id?: string }]>;
};

const testWindow = window as TelegramTestWindow;

function clearTelegramSdk() {
  delete testWindow.Telegram;
  delete testWindow.__next_s;
  testWindow.history.replaceState({}, '', '/');
  document.head.querySelectorAll('script[src*="telegram-web-app.js"]').forEach((node) => {
    node.remove();
  });
}

describe('Telegram SDK bootstrap', () => {
  beforeEach(clearTelegramSdk);

  afterEach(clearTelegramSdk);

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
    expect(TELEGRAM_SDK_BOOTSTRAP).toContain('__next_s');
    expect(TELEGRAM_SDK_BOOTSTRAP).not.toContain('eval(');
    expect(TELEGRAM_SDK_BOOTSTRAP).not.toContain('document.write');
    expect(() => new Function(TELEGRAM_SDK_BOOTSTRAP)).not.toThrow();
  });

  it('queues the SDK through Next.js only for a launch URL', () => {
    testWindow.history.replaceState(
      {},
      '',
      '/lobby#tgWebAppData=signed&tgWebAppVersion=8.0&tgWebAppPlatform=ios&tgWebAppStartParam=flow'
    );

    new Function(TELEGRAM_SDK_BOOTSTRAP)();

    expect(testWindow.__next_s).toEqual([
      [TELEGRAM_WEB_APP_SCRIPT_SRC, { id: TELEGRAM_WEB_APP_SCRIPT_ID }],
    ]);
  });

  it('does not queue the SDK for an ordinary browser visit', () => {
    testWindow.history.replaceState({}, '', '/flow?ref=newsletter');

    new Function(TELEGRAM_SDK_BOOTSTRAP)();

    expect(testWindow.__next_s).toBeUndefined();
  });

  it('does not queue a second SDK when Telegram or the script already exists', () => {
    testWindow.history.replaceState({}, '', '/flow#tgWebAppData=signed');
    testWindow.Telegram = { WebApp: { initData: 'signed' } };

    new Function(TELEGRAM_SDK_BOOTSTRAP)();

    expect(testWindow.__next_s).toBeUndefined();

    delete testWindow.Telegram;

    const script = document.createElement('script');
    script.src = TELEGRAM_WEB_APP_SCRIPT_SRC;
    document.head.appendChild(script);

    new Function(TELEGRAM_SDK_BOOTSTRAP)();

    expect(testWindow.__next_s).toBeUndefined();
  });

  it('injects the runtime fallback only once', () => {
    ensureTelegramSdk(document);
    ensureTelegramSdk(document);

    const scripts = document.head.querySelectorAll('script[src*="telegram-web-app.js"]');

    expect(scripts).toHaveLength(1);
    expect((scripts[0] as HTMLScriptElement).src).toBe(TELEGRAM_WEB_APP_SCRIPT_SRC);
    expect((scripts[0] as HTMLScriptElement).id).toBe(TELEGRAM_WEB_APP_SCRIPT_ID);
  });
});
