'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthContext';
import useIsTelegram from '@/components/useIsTelegram';

const IDENTITY_CACHE_KEY = 'temple_telegram_identity_v1';

type TelegramWebApp = {
  initData?: string;
};

function telegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;

  const webApp = (
    window as Window & {
      Telegram?: { WebApp?: TelegramWebApp };
    }
  ).Telegram?.WebApp;

  return webApp && typeof webApp === 'object' ? webApp : null;
}

function readCachedTelegramName(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const value = window.sessionStorage.getItem(IDENTITY_CACHE_KEY);

    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
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

export type TempleIdentity = {
  displayName: string;
  source: TempleIdentitySource;
  isLoading: boolean;
  error: string | null;
  isTelegram: boolean;
  /** Re-runs the server-side Telegram session exchange (e.g. after a 401). */
  refresh: () => Promise<boolean>;
};

/**
 * Single identity for the Temple rituals.
 *
 * - Supabase users keep using their verified Supabase session.
 * - Telegram visitors exchange raw, signed `initData` for the existing
 *   `temple_session` HttpOnly cookie. The client never invents the identity.
 */
export function useTempleIdentity(): TempleIdentity {
  const { user, profile, isLoading: authLoading } = useAuth();
  const isTelegram = useIsTelegram();

  const [telegramName, setTelegramName] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const bootstrapRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const supabaseName = (() => {
    const profileName =
      profile && typeof profile.name === 'string' ? profile.name.trim() : '';

    const metadataName =
      typeof user?.user_metadata?.name === 'string'
        ? user.user_metadata.name.trim()
        : '';

    return (
      profileName ||
      metadataName ||
      user?.email?.split('@')[0]?.trim() ||
      ''
    );
  })();

  const bootstrapTelegram = useCallback(async (): Promise<boolean> => {
    if (bootstrapRef.current) return bootstrapRef.current;

    const request = (async () => {
      const webApp = telegramWebApp();
      const initData = webApp?.initData;

      if (!initData) {
        if (mountedRef.current) {
          setError(
            'Telegram identity is not available. You can still witness the Vigil.'
          );
        }

        return false;
      }

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

        const payload = await response.json().catch(() => null);
        const displayName =
          payload && typeof payload.displayName === 'string'
            ? payload.displayName.trim()
            : '';

        if (!response.ok || !displayName) {
          throw new Error(payload?.error || 'Telegram session failed');
        }

        cacheTelegramName(displayName);

        if (mountedRef.current) {
          setTelegramName(displayName);
          setError(null);
        }

        return true;
      } catch (bootstrapError) {
        console.error('Temple identity error:', bootstrapError);

        if (mountedRef.current) {
          setTelegramName(null);
          setError(
            'Telegram identity could not be verified. You can still witness the Vigil.'
          );
        }

        return false;
      } finally {
        if (mountedRef.current) {
          setIsResolving(false);
        }
      }
    })();

    bootstrapRef.current = request;

    try {
      return await request;
    } finally {
      bootstrapRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (supabaseName) {
      setTelegramName(null);
      cacheTelegramName(null);
      setError(null);
      return;
    }

    if (!isTelegram) return;

    const cached = readCachedTelegramName();

    if (cached) {
      setTelegramName(cached);
      return;
    }

    void bootstrapTelegram();
  }, [authLoading, bootstrapTelegram, isTelegram, supabaseName]);

  const displayName = supabaseName || telegramName || '';

  return {
    displayName,
    source: supabaseName ? 'supabase' : telegramName ? 'telegram' : null,
    isLoading:
      authLoading ||
      (isTelegram && !supabaseName && !telegramName && !error) ||
      isResolving,
    error: !supabaseName && isTelegram ? error : null,
    isTelegram,
    refresh: bootstrapTelegram,
  };
}

export default useTempleIdentity;
