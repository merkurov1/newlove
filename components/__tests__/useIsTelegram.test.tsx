import { act, cleanup, renderHook } from '@testing-library/react';

import useIsTelegram, {
  __refreshTelegramEnvironmentForTests,
  __resetTelegramEnvironmentForTests,
  useTelegramEnvironment,
} from '@/components/useIsTelegram';

type TestWebApp = {
  initData?: string;
  platform?: string;
};

function setTelegram(webApp: TestWebApp | null) {
  if (webApp === null) {
    delete (window as Window & { Telegram?: unknown }).Telegram;
    return;
  }

  (window as Window & { Telegram?: unknown }).Telegram = { WebApp: webApp };
}

function removeTelegramScripts() {
  document
    .querySelectorAll('script[src*="telegram-web-app.js"]')
    .forEach((script) => script.remove());
}

beforeEach(() => {
  jest.useFakeTimers();
  __resetTelegramEnvironmentForTests();
  setTelegram(null);
  removeTelegramScripts();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  __resetTelegramEnvironmentForTests();
  setTelegram(null);
  removeTelegramScripts();
  jest.useRealTimers();
});

describe('useIsTelegram', () => {
  it('detects an SDK and raw initData that are already present at hydration', () => {
    setTelegram({ initData: 'signed-init-data', platform: 'android' });

    const { result } = renderHook(() => useTelegramEnvironment());

    expect(result.current.status).toBe('telegram');
    expect(result.current.isTelegram).toBe(true);
    expect(result.current.initData).toBe('signed-init-data');
    expect(result.current.initDataPending).toBe(false);
  });

  it('keeps waiting for a late SDK instead of stopping after three seconds', () => {
    const { result } = renderHook(() => useIsTelegram());

    expect(result.current).toBe(false);

    act(() => {
      jest.advanceTimersByTime(3_500);
    });

    expect(result.current).toBe(false);

    act(() => {
      setTelegram({ initData: 'late-signed-init-data', platform: 'android' });
      __refreshTelegramEnvironmentForTests();
    });

    expect(result.current).toBe(true);
  });

  it('distinguishes a detected Telegram shell from initData still arriving', () => {
    setTelegram({ initData: '', platform: 'ios' });

    const { result } = renderHook(() => useTelegramEnvironment());

    expect(result.current.status).toBe('telegram');
    expect(result.current.isTelegram).toBe(true);
    expect(result.current.initDataPending).toBe(true);

    act(() => {
      setTelegram({ initData: 'arrived-later', platform: 'ios' });
      __refreshTelegramEnvironmentForTests();
    });

    expect(result.current.initData).toBe('arrived-later');
    expect(result.current.initDataPending).toBe(false);
  });

  it('keeps a partially initialized SDK pending until initData arrives', () => {
    const { result } = renderHook(() => useTelegramEnvironment());

    act(() => {
      setTelegram({ initData: '' });
      __refreshTelegramEnvironmentForTests();
      jest.advanceTimersByTime(2_000);
    });

    expect(result.current.status).toBe('detecting');
    expect(result.current.isTelegram).toBe(false);

    act(() => {
      setTelegram({ initData: 'late-init-data' });
      __refreshTelegramEnvironmentForTests();
    });

    expect(result.current.status).toBe('telegram');
    expect(result.current.initData).toBe('late-init-data');
  });

  it('reacts to the deterministic SDK script load event', () => {
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    document.head.appendChild(script);

    const { result } = renderHook(() => useIsTelegram());

    expect(result.current).toBe(false);

    act(() => {
      setTelegram({ initData: 'from-load-event', platform: 'web' });
      script.dispatchEvent(new Event('load'));
    });

    expect(result.current).toBe(true);
  });

  it('does not treat an ordinary browser SDK as a Telegram Mini App', () => {
    setTelegram({ initData: '', platform: 'unknown' });

    const { result } = renderHook(() => useTelegramEnvironment());

    expect(result.current.status).toBe('browser');
    expect(result.current.isTelegram).toBe(false);
    expect(result.current.initData).toBe('');
  });

  it('stops the shared poll when the last subscriber unmounts', () => {
    setTelegram({ initData: '', platform: 'unknown' });

    const { unmount } = renderHook(() => useTelegramEnvironment());

    unmount();

    expect(jest.getTimerCount()).toBe(0);
  });
});
