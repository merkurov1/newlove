import React, { StrictMode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import useTempleIdentity from '@/hooks/useTempleIdentity';
import {
  __refreshTelegramEnvironmentForTests,
  __resetTelegramEnvironmentForTests,
} from '@/lib/telegram/detection';

type TestWebApp = {
  initData?: string;
  platform?: string;
};

function setTelegram(initData: string, platform = 'android') {
  (window as Window & { Telegram?: unknown }).Telegram = {
    WebApp: { initData, platform } satisfies TestWebApp,
  };
}

function clearTelegram() {
  delete (window as Window & { Telegram?: unknown }).Telegram;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: { get: () => 'application/json' },
  } as unknown as Response;
}

const useAuthMock = jest.fn();

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

const fetchMock = jest.fn();

function authCalls() {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/temple/auth'));
}

function meCalls() {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/temple/me'));
}

beforeEach(() => {
  useAuthMock.mockReturnValue({
    user: null,
    profile: null,
    isLoading: false,
  });
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  window.sessionStorage.clear();
  __resetTelegramEnvironmentForTests();
  clearTelegram();
});

afterEach(() => {
  cleanup();
  __resetTelegramEnvironmentForTests();
  clearTelegram();
  window.sessionStorage.clear();
  jest.restoreAllMocks();
});

describe('useTempleIdentity', () => {
  it('exchanges verified raw initData for the HttpOnly temple_session cookie', async () => {
    setTelegram('signed-init-data');
    fetchMock.mockResolvedValue(jsonResponse({ success: true, displayName: 'Anna' }));

    const { result } = renderHook(() => useTempleIdentity());

    await waitFor(() => {
      expect(result.current.status).toBe('verified');
    });

    expect(result.current.displayName).toBe('Anna');
    expect(result.current.source).toBe('telegram');
    expect(result.current.isTelegram).toBe(true);

    const [url, init] = authCalls()[0];

    expect(String(url)).toBe('/api/temple/auth');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      initData: 'signed-init-data',
    });
  });

  it('restores an existing HttpOnly session when initData has not arrived yet', async () => {
    setTelegram('');
    fetchMock.mockResolvedValue(jsonResponse({ displayName: 'Olga', source: 'telegram' }));

    const { result } = renderHook(() => useTempleIdentity());

    await waitFor(() => {
      expect(result.current.status).toBe('verified');
    });

    expect(result.current.displayName).toBe('Olga');
    expect(result.current.source).toBe('telegram');
    expect(meCalls()).toHaveLength(1);
    expect(authCalls()).toHaveLength(0);
  });

  it('automatically exchanges initData that appears after the SDK', async () => {
    setTelegram('');
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/temple/me')) {
        return jsonResponse({ displayName: null, source: null });
      }

      if (url.includes('/api/temple/auth')) {
        return jsonResponse({ success: true, displayName: 'Late Anna' });
      }

      return jsonResponse({});
    });

    const { result } = renderHook(() => useTempleIdentity());

    await waitFor(() => {
      expect(result.current.status).toBe('telegram-init-pending');
    });
    expect(result.current.source).toBeNull();
    expect(authCalls()).toHaveLength(0);

    act(() => {
      setTelegram('late-signed-init-data');
      __refreshTelegramEnvironmentForTests();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('verified');
    });

    expect(result.current.displayName).toBe('Late Anna');
    expect(authCalls()).toHaveLength(1);
  });

  it('does not use a cached display name as identity before server verification', async () => {
    window.sessionStorage.setItem('temple_telegram_identity_v1', 'Cached Mallory');
    setTelegram('');
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/temple/me')) {
        return jsonResponse({ displayName: null, source: null });
      }

      if (url.includes('/api/temple/auth')) {
        return jsonResponse({ success: true, displayName: 'Verified Anna' });
      }

      return jsonResponse({});
    });

    const { result } = renderHook(() => useTempleIdentity());

    await waitFor(() => {
      expect(result.current.status).toBe('telegram-init-pending');
    });

    expect(result.current.displayName).toBe('');
    expect(result.current.source).toBeNull();
    expect(result.current.status).not.toBe('verified');

    act(() => {
      setTelegram('valid-signed-init-data');
      __refreshTelegramEnvironmentForTests();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('verified');
    });

    expect(result.current.displayName).toBe('Verified Anna');
    expect(result.current.source).toBe('telegram');
  });

  it('shows a neutral Telegram failure for invalid initData without falling back to Google', async () => {
    setTelegram('tampered-init-data');
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Invalid Telegram InitData' }, 401));

    const { result } = renderHook(() => useTempleIdentity());

    await waitFor(() => {
      expect(result.current.status).toBe('telegram-unverified');
    });

    expect(result.current.source).toBeNull();
    expect(result.current.displayName).toBe('');
    expect(result.current.error).toMatch(/could not be verified/i);
    expect(result.current.isTelegram).toBe(true);
    expect(authCalls()).toHaveLength(1);
  });

  it('re-acquires the session once on an explicit refresh after a 401, not in a loop', async () => {
    setTelegram('expired-cookie-init-data');

    let attempts = 0;

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/temple/auth')) {
        attempts += 1;

        return attempts === 1
          ? jsonResponse({ error: 'Invalid Telegram InitData' }, 401)
          : jsonResponse({ success: true, displayName: 'Restored Anna' });
      }

      return jsonResponse({});
    });

    const { result } = renderHook(() => useTempleIdentity());

    await waitFor(() => {
      expect(result.current.status).toBe('telegram-unverified');
    });

    expect(authCalls()).toHaveLength(1);

    let refreshed = false;

    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(refreshed).toBe(true);
    expect(authCalls()).toHaveLength(2);

    await waitFor(() => {
      expect(result.current.status).toBe('verified');
    });

    expect(result.current.displayName).toBe('Restored Anna');
  });

  it('does not duplicate the exchange under React StrictMode', async () => {
    setTelegram('strict-mode-init-data');
    fetchMock.mockResolvedValue(jsonResponse({ success: true, displayName: 'Anna' }));

    const { result } = renderHook(() => useTempleIdentity(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <StrictMode>{children}</StrictMode>,
    });

    await waitFor(() => {
      expect(result.current.status).toBe('verified');
    });

    expect(authCalls()).toHaveLength(1);
  });

  it('leaves the ordinary browser path anonymous without Telegram calls', async () => {
    setTelegram('', 'unknown');

    const { result } = renderHook(() => useTempleIdentity());

    await waitFor(() => {
      expect(result.current.status).toBe('anonymous');
    });

    expect(result.current.isTelegram).toBe(false);
    expect(result.current.displayName).toBe('');
    expect(result.current.source).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the verified Supabase identity unchanged', async () => {
    useAuthMock.mockReturnValue({
      user: {
        email: 'ada@example.com',
        user_metadata: { name: 'Ada' },
      },
      profile: { name: 'Ada Lovelace' },
      isLoading: false,
    });
    setTelegram('telegram-init-data');

    const { result } = renderHook(() => useTempleIdentity());

    await waitFor(() => {
      expect(result.current.status).toBe('verified');
    });

    expect(result.current.displayName).toBe('Ada Lovelace');
    expect(result.current.source).toBe('supabase');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
