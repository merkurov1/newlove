
import { usePrivy } from '@privy-io/react-auth';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export function usePrivyAuth() {
  const { login, logout, ready, authenticated, getAccessToken, user } = usePrivy();
  const { data: session, status, update } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<any>(null);
  const [fallbackTried, setFallbackTried] = useState(false);
  const loginInProgress = useRef(false);

  // Получить токен с fallback: SDK -> cookie
  const getAuthToken = useCallback(async () => {
    let token = null;
    try {
      token = await getAccessToken();
      if (token) return token;
    } catch {}
    token = getCookie('privy-token') || getCookie('privy-id-token');
    return token;
  }, [getAccessToken]);

  // Основная функция логина через Privy
  const handleLogin = useCallback(async () => {
    if (loginInProgress.current) return;
    loginInProgress.current = true;
    setIsLoading(true);
    setError(null);
    setDebug(null);
    try {
      await login();
      await new Promise(res => setTimeout(res, 1200));
      const authToken = await getAuthToken();
      if (!authToken) throw new Error('🔐 Не удалось получить токен Privy');
      // POST на сервер для создания юзера
      const res = await fetch('/api/auth/privy-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '❌ Ошибка сервера при создании сессии');
      // signIn через NextAuth (без redirect)
      const signInRes = await signIn('privy', {
        accessToken: authToken,
        redirect: false,
        callbackUrl: '/',
      });
      setDebug({ authToken, server: data, signInRes });
      if (signInRes?.error) throw new Error('❌ Ошибка NextAuth: ' + signInRes.error);
      // Ждём появления session (до 2 сек)
      let waited = 0;
      while (waited < 2000) {
        await new Promise(res => setTimeout(res, 200));
        await update?.();
        if (typeof window !== 'undefined') {
          const s = window.localStorage.getItem('nextauth.message');
          if (s && s.includes('session')) break;
        }
        waited += 200;
      }
      // Если session не появилась — fallback signIn с redirect (один раз)
      if (!session && !fallbackTried) {
        setFallbackTried(true);
        await signIn('privy', { accessToken: authToken, redirect: true, callbackUrl: '/' });
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsLoading(false);
      loginInProgress.current = false;
    }
  }, [login, getAuthToken, session, fallbackTried, update]);

  // Автоматический login recovery: если есть Privy auth, но нет NextAuth session
  useEffect(() => {
    if (authenticated && status === 'unauthenticated' && !isLoading && !loginInProgress.current) {
      handleLogin();
    }
    // eslint-disable-next-line
  }, [authenticated, status]);

  return {
    ready,
    authenticated,
    user,
    isLoading,
    error,
    login: handleLogin,
    logout,
    getAuthToken,
    session,
    status,
    debug,
  };
}
