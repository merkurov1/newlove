import { usePrivy } from '@privy-io/react-auth';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export function usePrivyAuth() {
  const { login, logout, ready, authenticated, getAccessToken, getIdToken, user } = usePrivy();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<any>(null);
  const retryRef = useRef(0);

  // Получить токен с fallback: SDK -> cookie -> retry
  const getAuthToken = useCallback(async () => {
    let token = null;
    try {
      token = await getAccessToken();
      if (token) return token;
      token = await getIdToken?.();
      if (token) return token;
    } catch {}
    // Fallback: cookie
    token = getCookie('privy-token') || getCookie('privy-id-token');
    if (token) return token;
    // Retry через 1 сек
    if (retryRef.current < 2) {
      retryRef.current++;
      await new Promise(res => setTimeout(res, 1000));
      return getAuthToken();
    }
    return null;
  }, [getAccessToken, getIdToken]);

  // Основная функция логина
  const handleLogin = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setDebug(null);
    try {
      await login();
      await new Promise(res => setTimeout(res, 1500));
      const authToken = await getAuthToken();
      if (!authToken) throw new Error('🔐 Не удалось получить токен Privy');
      // POST на сервер для создания сессии
      const res = await fetch('/api/auth/privy-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '❌ Ошибка сервера при создании сессии');
      // signIn через NextAuth
      const signInRes = await signIn('privy', {
        accessToken: authToken,
        redirect: false,
        callbackUrl: '/',
      });
      setDebug({ authToken, server: data, signInRes });
      if (signInRes?.error) throw new Error('❌ Ошибка NextAuth: ' + signInRes.error);
      // Если signIn успешен, сохраняем токен во временное sessionStorage и делаем reload
      if (signInRes?.ok && typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('privy-recovery-token', authToken);
          sessionStorage.setItem('privy-recovery-ts', String(Date.now()));
        } catch (e) {
          // ignore storage errors
        }
        window.location.reload();
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  }, [login, getAuthToken]);

  // Auto-recovery: если есть Privy auth, но нет NextAuth session
  useEffect(() => {
    if (authenticated && status === 'unauthenticated' && !isLoading) {
      handleLogin();
    }
    // eslint-disable-next-line
  }, [authenticated, status]);

  // После reload: проверить, есть ли privy-recovery-token в sessionStorage и выполнить signIn redirect если нужно
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const token = sessionStorage.getItem('privy-recovery-token');
      const ts = sessionStorage.getItem('privy-recovery-ts');
      const done = sessionStorage.getItem('privy-recovery-done');
      if (token && ts && !done) {
        // если прошло менее 10 секунд с момента записи — пытаемся signIn с redirect
        const age = Date.now() - Number(ts || 0);
        if (age < 10000) {
          sessionStorage.setItem('privy-recovery-done', '1');
          signIn('privy', { accessToken: token, redirect: true, callbackUrl: '/' });
        } else {
          // устаревший токен — очистим
          sessionStorage.removeItem('privy-recovery-token');
          sessionStorage.removeItem('privy-recovery-ts');
        }
      }
    } catch (e) {
      // ignore
    }
  }, []);

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
