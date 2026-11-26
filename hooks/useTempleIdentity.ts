'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthContext';
import { readTelegramInitData, useTelegramEnvironment } from '@/lib/telegram/detection';

const IDENTITY_CACHE_KEY = 'temple_telegram_identity_v1';

type TelegramIdentityPayload = {
  displayName?: unknown;
  source?: unknown;
  error?: unknown;
  /**
   * Signed server session token returned by `/api/temple/auth`. It is kept in
   * memory only and is used as a bearer fallback when the HttpOnly cookie is
   * unavailable (for example a third-party WebView or a blocked cookie).
   */
  token?: unknown;
};

function readDisplayName(payload: TelegramIdentityPayload | null): string {
  return payload && typeof payload.displayName === 'string' ? payload.displayName.trim() : '';
}

function cacheTelegramName(name: string | null) {
  if (typeof window === 'undefined') return;

  try {
    if (name) {
      window.sessionStorage.setItem(IDENTITY_CACHE_KEY, name);
    } else {
      window.sessionStorage.removeItem(IDENTITY_CACHE_KEY);
    }
  } catch {
    // A blocked sessionStorage must not block the ritual.
  }
}

export type TempleIdentitySource = 'supabase' | 'telegram' | null;

/**
 * UI-level identity states. Detection is intentionally separate from identity:
 * `telegram-init-pending`/`telegram-verifying` are not authenticated, and only
 * `verified` comes from a server-validated session.
 */
export type TempleIdentityStatus =
  | 'detecting'
  | 'telegram-init-pending'
  | 'telegram-verifying'
  | 'verified'
  | 'telegram-unverified'
  | 'anonymous';

export type TempleIdentity = {
  displayName: string;
  source: TempleIdentitySource;
  status: TempleIdentityStatus;
  /** Telegram shell detected, raw initData not received yet. */
  initDataPending: boolean;
  isLoading: boolean;
  error: string | null;
  isTelegram: boolean;
  /**
   * Re-runs the server-side Telegram session exchange (e.g. after a 401).
   * `force` bypasses the cached successful exchange so the cookie/token can be
   * renewed even when the same initData is still cached in memory.
   */
  refresh: (options?: { force?: boolean }) => Promise<boolean>;
  /**
   * Signed server-issued Telegram session token for a bearer fallback.
   * Always null for Supabase identities. It is never read from storage or from
   * `initDataUnsafe`; only `/api/temple/auth` can populate it.
   */
  getAuthToken: () => string | null;
};

const TELEGRAM_FAILED_MESSAGE =
  'Telegram identity could not be verified. You can still witness the Vigil.';

function telegramPayload(payload: unknown): TelegramIdentityPayload | null {
  return payload && typeof payload === 'object' ? (payload as TelegramIdentityPayload) : null;
}

/**
 * Single identity for the Temple rituals.
 *
 * - Supabase users keep using their verified Supabase session.
 * - Telegram visitors exchange raw, signed `initData` for the existing
 *   `temple_session` HttpOnly cookie. The client never invents the identity
 *   and never promotes `initDataUnsafe`, a client name or sessionStorage into
 *   an authenticated identity.
 * - An existing HttpOnly cookie can restore the session before initData
 *   arrives (e.g. when a Mini App is reopened).
 */
export function useTempleIdentity(): TempleIdentity {
  const { user, profile, isLoading: authLoading } = useAuth();
  const environment = useTelegramEnvironment();
  const isTelegram = environment.isTelegram;

  const [telegramName, setTelegramName] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const telegramNameRef = useRef<string | null>(null);
  const telegramTokenRef = useRef<string | null>(null);
  const verifiedInitDataRef = useRef<string | null>(null);
  const failedInitDataRef = useRef<string | null>(null);
  const pendingExchangeRef = useRef<{
    initData: string;
    promise: Promise<boolean>;
  } | null>(null);
  const restoreRef = useRef<Promise<boolean> | null>(null);
  const restoreAttemptedRef = useRef(false);
  const attemptIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const supabaseName = (() => {
    const profileName = profile && typeof profile.name === 'string' ? profile.name.trim() : '';

    const metadataName =
      typeof user?.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : '';

    return profileName || metadataName || user?.email?.split('@')[0]?.trim() || '';
  })();

  const exchangeInitData = useCallback(async (initData: string, force = false): Promise<boolean> => {
    if (!initData) return false;

    const pending = pendingExchangeRef.current;

    if (!force && pending?.initData === initData) return pending.promise;

    if (!force && verifiedInitDataRef.current === initData && telegramNameRef.current) {
      return true;
    }

    const attemptId = attemptIdRef.current + 1;
    attemptIdRef.current = attemptId;

    const request = (async () => {
      if (mountedRef.current) {
        setIsResolving(true);
        setError(null);
      }

      try {
        const response = await fetch('/api/temple/auth', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });

        const payload = telegramPayload(await response.json().catch(() => null));
        const displayName = readDisplayName(payload);
        const token =
          payload && typeof payload.token === 'string' && payload.token
            ? payload.token
            : null;

        if (!response.ok || !displayName) {
          throw new Error(
            typeof payload?.error === 'string' ? payload.error : 'Telegram session failed'
          );
        }

        if (attemptId !== attemptIdRef.current) return false;

        verifiedInitDataRef.current = initData;
        failedInitDataRef.current = null;
        telegramTokenRef.current = token;
        cacheTelegramName(displayName);

        if (mountedRef.current) {
          telegramNameRef.current = displayName;
          setTelegramName(displayName);
          setError(null);
        }

        return true;
      } catch (bootstrapError) {
        if (attemptId !== attemptIdRef.current) return false;

        verifiedInitDataRef.current = null;
        failedInitDataRef.current = initData;
        telegramTokenRef.current = null;

        // Never log the raw launch data or a bot/session secret.
        console.error(
          'Temple identity error:',
          bootstrapError instanceof Error ? bootstrapError.message : 'Telegram session failed'
        );

        if (mountedRef.current) {
          telegramNameRef.current = null;
          setTelegramName(null);
          setError(TELEGRAM_FAILED_MESSAGE);
        }

        return false;
      } finally {
        if (attemptId === attemptIdRef.current && mountedRef.current) {
          setIsResolving(false);
        }
      }
    })();

    pendingExchangeRef.current = { initData, promise: request };

    try {
      return await request;
    } finally {
      if (pendingExchangeRef.current?.promise === request) {
        pendingExchangeRef.current = null;
      }
    }
  }, []);

  const restoreSession = useCallback(async (force = false): Promise<boolean> => {
    if (restoreRef.current) return restoreRef.current;

    if (!force && restoreAttemptedRef.current) return false;

    restoreAttemptedRef.current = true;

    const request = (async () => {
      if (mountedRef.current) {
        setIsResolving(true);
        setError(null);
      }

      try {
        const response = await fetch('/api/temple/me', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const payload = telegramPayload(await response.json().catch(() => null));
        const displayName = readDisplayName(payload);

        if (response.ok && payload?.source === 'telegram' && displayName) {
          cacheTelegramName(displayName);

          if (mountedRef.current) {
            telegramNameRef.current = displayName;
            setTelegramName(displayName);
            setError(null);
          }

          return true;
        }

        return false;
      } catch {
        // A missing/expired cookie is not an error: initData may still arrive.
        return false;
      } finally {
        if (mountedRef.current) {
          setIsResolving(false);
        }
      }
    })();

    restoreRef.current = request;

    try {
      return await request;
    } finally {
      if (restoreRef.current === request) {
        restoreRef.current = null;
      }
    }
  }, []);

  const refresh = useCallback(async (options?: { force?: boolean }): Promise<boolean> => {
    const force = options?.force === true;
    const initData = readTelegramInitData();

    if (initData) {
      return exchangeInitData(initData, force);
    }

    if (!isTelegram) return false;

    // No launch data: only a still-valid HttpOnly cookie can restore identity.
    return restoreSession(true);
  }, [exchangeInitData, isTelegram, restoreSession]);

  const getAuthToken = useCallback(() => telegramTokenRef.current, []);

  useEffect(() => {
    if (authLoading) return;

    if (supabaseName) {
      verifiedInitDataRef.current = null;
      failedInitDataRef.current = null;
      telegramNameRef.current = null;
      telegramTokenRef.current = null;
      setTelegramName(null);
      setError(null);
      cacheTelegramName(null);
      return;
    }

    if (environment.status === 'detecting') {
      return;
    }

    if (!environment.isTelegram) {
      verifiedInitDataRef.current = null;
      failedInitDataRef.current = null;
      telegramNameRef.current = null;
      telegramTokenRef.current = null;
      setTelegramName(null);
      setError(null);
      cacheTelegramName(null);
      return;
    }

    if (environment.initData) {
      if (verifiedInitDataRef.current === environment.initData) return;
      if (failedInitDataRef.current === environment.initData) return;

      void exchangeInitData(environment.initData);
      return;
    }

    // Telegram shell without raw initData yet: try the existing signed cookie
    // once, then wait for initData (which may arrive later).
    if (!restoreAttemptedRef.current) {
      void restoreSession();
    }
  }, [
    authLoading,
    environment.initData,
    environment.isTelegram,
    environment.status,
    exchangeInitData,
    restoreSession,
    supabaseName,
  ]);

  const displayName = supabaseName || telegramName || '';

  let status: TempleIdentityStatus;

  if (authLoading) {
    status = 'detecting';
  } else if (supabaseName) {
    status = 'verified';
  } else if (environment.status === 'detecting') {
    status = 'detecting';
  } else if (!environment.isTelegram) {
    status = 'anonymous';
  } else if (telegramName) {
    status = 'verified';
  } else if (error) {
    status = 'telegram-unverified';
  } else if (isResolving) {
    status = 'telegram-verifying';
  } else {
    status = 'telegram-init-pending';
  }

  const source: TempleIdentitySource = supabaseName ? 'supabase' : telegramName ? 'telegram' : null;

  return {
    displayName,
    source,
    status,
    initDataPending: environment.isTelegram && !environment.initData,
    isLoading:
      authLoading ||
      status === 'detecting' ||
      status === 'telegram-verifying' ||
      status === 'telegram-init-pending',
    error: !supabaseName && environment.isTelegram ? error : null,
    isTelegram,
    refresh,
    getAuthToken,
  };
}

export default useTempleIdentity;
