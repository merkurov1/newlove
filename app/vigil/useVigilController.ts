'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import usePrefersReducedMotion from '@/components/pierrot/usePrefersReducedMotion';
import useTempleIdentity from '@/hooks/useTempleIdentity';
import { detectTelegramEnvironment } from '@/lib/telegram/detection';
import {
  VIGIL_COOLDOWN_MS,
  formatVigilCooldown,
  vigilCooldownMessage,
} from '@/lib/vigil/cooldown';
import { resolveVigilFlame } from '@/lib/vigil/flame';
import { useVigilSupporters } from '@/hooks/useVigilSupporters';
import { hapticNotification } from '@/lib/telegram/webApp';

const FLAME_ID = 1;
const CLOCK_REFRESH_MS = 30_000;
const CLAIM_TIMEOUT_MS = 20_000;
const TOKEN_READ_TIMEOUT_MS = 8_000;
const AUTH_TIMEOUT_MS = 15_000;
// Guest Send Spark starts the existing account flow and returns here. The path
// is hard-coded (and accepted by the safe-return validator) so a guest cannot
// be redirected anywhere else.
const VIGIL_REGISTER_PATH = '/login?mode=register&next=%2Fvigil';
const VIGIL_RETURN_PATH = '/vigil';

/**
 * Read the browser session without letting a stalled storage/auth lock keep
 * the Send Spark action in "Sending…" forever. A timeout falls through to the
 * server-issued Telegram token (or no token); the claim route then returns a
 * clear 401 instead of leaving the UI pending.
 */
async function readSupabaseSessionToken(): Promise<string | null> {
  try {
    const session = await new Promise<{ access_token?: string } | null>(
      (resolve) => {
        let settled = false;

        const finish = (value: { access_token?: string } | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        };

        const timer = setTimeout(() => finish(null), TOKEN_READ_TIMEOUT_MS);

        supabase.auth.getSession().then(
          ({ data }) => finish(data.session ?? null),
          () => finish(null)
        );
      }
    );

    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Supplementary heart display data only. The shared flame clock itself comes
 * from `/api/vigil/state`; this record must never drive lit state or intensity.
 */
export type VigilFlameData = {
  id: number;
  owner_name: string | null;
  [key: string]: unknown;
};

export type VigilSparkPosition = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

type VigilStatusResponse = {
  authenticated?: boolean;
  canSpark?: boolean;
  remainingMs?: number;
  remainingLabel?: string;
  lastSparkAt?: string | null;
};

function channelName(): string {
  return `vigil_live_sync_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Vigil controller: identity, server-authoritative cooldown, public flame
 * state, timers, Realtime and the claim request. It owns no artwork, so the
 * modal and the standalone route render exactly the same behaviour.
 */
export function useVigilController() {
  const identity = useTempleIdentity();
  const reduceMotion = usePrefersReducedMotion();
  const router = useRouter();

  // The homepage and this ritual read the very same authoritative snapshot.
  const {
    supporterCount,
    lifetimeTotal,
    uniqueParticipants,
    returningParticipants,
    repeatRate,
    analyticsSince,
    analyticsAvailable,
    lastLitAt,
    flameExpiresAt,
    flameLit: serverFlameLit,
    status: sharedFlameStatus,
    error: sharedFlameError,
    refresh: refreshSharedFlame,
  } = useVigilSupporters();

  const angelRef = useRef<HTMLDivElement | null>(null);
  const heartRef = useRef<HTMLDivElement | null>(null);
  const cooldownEndsAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sparkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRetryRef = useRef(false);
  const sendingRef = useRef(false);
  const authenticatingRef = useRef(false);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [flameData, setFlameData] = useState<VigilFlameData | null>(null);
  const [isLighting, setIsLighting] = useState(false);
  const [spark, setSpark] = useState<VigilSparkPosition | null>(null);
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [authRetryNonce, setAuthRetryNonce] = useState(0);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState<number | null>(
    null
  );

  const userName = identity.displayName;
  const identityIsLoading = identity.isLoading;
  const identityIsTelegram = identity.isTelegram;
  const identitySource = identity.source;
  const refreshIdentity = identity.refresh;
  const getIdentityToken = identity.getAuthToken;

  const isOnCooldown =
    cooldownRemainingMs !== null && cooldownRemainingMs > 0;
  const cooldownLabel = isOnCooldown
    ? formatVigilCooldown(cooldownRemainingMs)
    : '';

  const flameReady =
    sharedFlameStatus === 'ready' || sharedFlameStatus === 'stale';
  const flameVisuals = useMemo(
    () =>
      resolveVigilFlame(
        {
          flameLit: flameReady ? serverFlameLit : false,
          lastLitAt,
          flameExpiresAt,
          supporterCount: flameReady ? supporterCount : 0,
        },
        nowMs
      ),
    [
      flameExpiresAt,
      flameReady,
      lastLitAt,
      nowMs,
      serverFlameLit,
      supporterCount,
    ]
  );
  const flameLit = flameReady && flameVisuals.active;
  const flameLabel = flameVisuals.remainingLabel;

  const applyCooldown = useCallback((remainingMs: number) => {
    const safeRemaining = Number.isFinite(remainingMs)
      ? Math.max(0, Math.min(VIGIL_COOLDOWN_MS, remainingMs))
      : 0;

    if (safeRemaining <= 0) {
      cooldownEndsAtRef.current = null;
      setCooldownRemainingMs(null);
      return;
    }

    cooldownEndsAtRef.current = Date.now() + safeRemaining;
    setCooldownRemainingMs(safeRemaining);
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const { data: flame, error } = await supabase
        .from('vigil_hearts')
        // Only public-safe columns are readable by anon/authenticated. owner_id
        // and intention are private and never selected here.
        .select('id, owner_name, last_lit_at')
        .eq('id', FLAME_ID)
        .maybeSingle();

      if (error) {
        console.error('Vigil flame error:', error);
      } else if (flame) {
        setFlameData(flame as VigilFlameData);
      }
    } catch (error) {
      console.error('Vigil refresh error:', error);
    }
  }, []);

  const updateClock = useCallback(() => {
    setNowMs(Date.now());

    const endsAt = cooldownEndsAtRef.current;

    if (!endsAt) return;

    const remaining = endsAt - Date.now();

    if (remaining <= 0) {
      cooldownEndsAtRef.current = null;
      setCooldownRemainingMs(null);
      return;
    }

    setCooldownRemainingMs(remaining);
  }, []);

  useEffect(() => {
    void refreshData();

    const channel = supabase
      .channel(channelName())
      .on(
        'postgres_changes',
        // The public-safe signal is the only Realtime source. The raw
        // vigil_hearts row (owner_id, intention) is never broadcast.
        { event: 'INSERT', schema: 'public', table: 'temple_chronicle_signals' },
        (payload) => {
          const eventType = String(
            (payload?.new as { event_type?: unknown } | null)?.event_type || ''
          ).toUpperCase();

          if (eventType === 'VIGIL_SPARK') {
            void refreshData();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Vigil realtime channel error');
        }
      });

    // One interval for both clocks: the public flame countdown and the private
    // cooldown. It is never recreated by state changes, so opening/closing the
    // modal cannot stack duplicates.
    timerRef.current = setInterval(updateClock, CLOCK_REFRESH_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') updateClock();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      supabase.removeChannel(channel);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (sparkTimeoutRef.current) {
        clearTimeout(sparkTimeoutRef.current);
        sparkTimeoutRef.current = null;
      }

      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshData, updateClock]);

  const readBearerToken = useCallback(async (): Promise<string | null> => {
    const telegramToken = getIdentityToken();

    // A verified Telegram identity is anchored to the server-issued signed
    // session. A stale Supabase session in the same WebView must not shadow it
    // and turn a valid Mini App visit into a 401.
    if (identitySource === 'telegram' && telegramToken) return telegramToken;

    const supabaseToken = await readSupabaseSessionToken();

    if (supabaseToken) return supabaseToken;

    return telegramToken;
  }, [getIdentityToken, identitySource]);

  // Ask the server for this identity's own cooldown. The public flame timer is
  // never used to infer whether this visitor may spark.
  useEffect(() => {
    if (identityIsLoading || !userName) return;

    let cancelled = false;

    // A new identity gets one fresh server exchange attempt.
    statusRetryRef.current = false;

    const loadStatus = async (): Promise<{
      status: VigilStatusResponse | null;
      hadToken: boolean;
    }> => {
      try {
        const token = await readBearerToken();

        const response = await fetch('/api/vigil/claim', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!response.ok) return { status: null, hadToken: Boolean(token) };

        return {
          status: (await response.json().catch(() => null)) as
            | VigilStatusResponse
            | null,
          hadToken: Boolean(token),
        };
      } catch {
        return { status: null, hadToken: false };
      }
    };

    const resolveStatus = async () => {
      let { status, hadToken } = await loadStatus();

      if (
        !cancelled &&
        status &&
        status.authenticated === false &&
        !statusRetryRef.current
      ) {
        // A cached display name can survive while the signed session expired.
        // Re-exchange exactly once, then let the UI show a recoverable state
        // instead of leaving an enabled action that always fails.
        statusRetryRef.current = true;

        if (identityIsTelegram) {
          const refreshed = await refreshIdentity({ force: true });

          if (refreshed && !cancelled) {
            ({ status, hadToken } = await loadStatus());
          }
        } else if (identitySource === 'supabase') {
          try {
            const { data } = await supabase.auth.refreshSession();

            if (data.session?.access_token && !cancelled) {
              ({ status, hadToken } = await loadStatus());
            }
          } catch {
            // Fall through to the expired-session state below.
          }
        }
      }

      if (cancelled) return;

      if (!status?.authenticated) {
        // Only a server rejection of an actual credential is an expired
        // session. A token read that timed out must not lock out a valid
        // session; the claim itself will surface a clear error if needed.
        if (status && (hadToken || identityIsTelegram)) setAuthExpired(true);
        return;
      }

      setAuthExpired(false);
      applyCooldown(
        typeof status.remainingMs === 'number' ? status.remainingMs : 0
      );
    };

    void resolveStatus();

    return () => {
      cancelled = true;
    };
  }, [
    applyCooldown,
    authRetryNonce,
    identityIsLoading,
    identityIsTelegram,
    identitySource,
    readBearerToken,
    refreshIdentity,
    userName,
  ]);

  const retrySession = useCallback(() => {
    // Explicit user recovery: re-check the server with a freshly exchanged
    // session instead of leaving a dead "expired" action on screen.
    setAuthExpired(false);
    setRateLimitMsg(null);
    setAuthRetryNonce((value) => value + 1);
  }, []);

  const measureHeartTarget = useCallback(() => {
    if (!heartRef.current) return null;

    const heartRect = heartRef.current.getBoundingClientRect();

    return {
      x: heartRect.left + heartRect.width / 2,
      y: heartRect.top + heartRect.height / 2,
    };
  }, []);

  // Keep the flight target attached to the heart while the page scrolls or
  // the viewport changes. The origin remains the visitor's action point.
  useEffect(() => {
    if (!spark) return;

    const syncTarget = () => {
      const end = measureHeartTarget();

      if (!end) return;

      setSpark((current) => (current ? { ...current, end } : current));
    };

    window.addEventListener('scroll', syncTarget, { passive: true });
    window.addEventListener('resize', syncTarget);

    return () => {
      window.removeEventListener('scroll', syncTarget);
      window.removeEventListener('resize', syncTarget);
    };
  }, [spark, measureHeartTarget]);

  /**
   * Starts the existing credential flow for a guest. Web visitors go through
   * the established login/registration page with a safe `/vigil` return; a
   * Telegram launch exchanges its signed initData (or restores the signed
   * cookie) and then continues straight into the claim.
   */
  const startGuestAuthentication = useCallback(async (): Promise<boolean> => {
    if (authenticatingRef.current) return false;

    setSuccessMessage(null);
    setRateLimitMsg(null);

    // Read the environment synchronously as well: a guest can tap before the
    // shared detection state has reached React. Launch hash/bridge signals are
    // already available at that point, so a Telegram visitor is never sent to
    // the web login page by a timing race.
    const telegramContext =
      identityIsTelegram || detectTelegramEnvironment().isTelegram;

    if (!telegramContext) {
      try {
        window.localStorage.setItem('login_redirect_path', VIGIL_RETURN_PATH);
      } catch {
        // Private browsing can block storage; the URL already carries `next`.
      }

      router.push(VIGIL_REGISTER_PATH);
      return false;
    }

    authenticatingRef.current = true;
    setIsAuthenticating(true);

    try {
      const refreshed = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), AUTH_TIMEOUT_MS);

        refreshIdentity({ force: true }).then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          () => {
            clearTimeout(timer);
            resolve(false);
          }
        );
      });

      if (!refreshed) {
        setRateLimitMsg(
          'Telegram could not confirm your identity. Reopen this page from the Telegram bot, then tap Send Spark again.'
        );
        return false;
      }

      // The exchange updates the signed token ref before it resolves, so the
      // claim can continue in this same tap.
      return true;
    } catch {
      setRateLimitMsg(
        'Telegram sign-in could not be completed. Please try again.'
      );
      return false;
    } finally {
      authenticatingRef.current = false;
      setIsAuthenticating(false);
    }
  }, [identityIsTelegram, refreshIdentity, router]);

  const triggerRitual = useCallback(
    async (event?: React.MouseEvent<HTMLButtonElement>) => {
      if (sendingRef.current || authenticatingRef.current || isLighting) return;

      // The spark begins exactly where the visitor acted. Read the synthetic
      // event before any await: React clears `currentTarget` after the handler
      // yields, and a guest authentication round trip happens first.
      let origin = { x: 0, y: 0 };

      if (event) {
        const rect = event.currentTarget.getBoundingClientRect();
        origin = {
          x: event.clientX || rect.left + rect.width / 2,
          y: event.clientY || rect.top + rect.height / 2,
        };
      } else if (heartRef.current) {
        const rect = heartRef.current.getBoundingClientRect();
        origin = { x: rect.left, y: rect.top };
      }

      // Guest Send Spark is the registration/auth entry, not a dead end:
      // a browser is sent through the existing login/registration flow (which
      // returns to /vigil), while a Telegram launch exchanges its signed
      // initData or restores the server session before the claim continues.
      let usedGuestTelegram = false;

      if (!userName) {
        const authenticated = await startGuestAuthentication();

        if (!authenticated) return;

        usedGuestTelegram = true;
      }

      if (isOnCooldown) {
        setSuccessMessage(null);
        setRateLimitMsg(vigilCooldownMessage(cooldownRemainingMs ?? 0));
        return;
      }

      const telegramIdentity = identityIsTelegram || usedGuestTelegram;

      sendingRef.current = true;
      setIsLighting(true);
      setRateLimitMsg(null);
      setSuccessMessage(null);

      try {
        const requestClaim = async (token: string | null) => {
          // A stalled network must never leave the action in a permanent
          // "Sending your spark…" state.
          const controller = new AbortController();
          const timeout = setTimeout(
            () => controller.abort(),
            CLAIM_TIMEOUT_MS
          );

          try {
            const response = await fetch('/api/vigil/claim', {
              method: 'POST',
              credentials: 'same-origin',
              cache: 'no-store',
              signal: controller.signal,
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ id: FLAME_ID }),
            });

            const payload = await response.json().catch(() => null);

            return { response, payload };
          } finally {
            clearTimeout(timeout);
          }
        };

        // A guest Telegram claim must use the freshly issued signed token (or
        // the HttpOnly temple_session cookie when no bearer is returned). It
        // must not fall back to a stale Supabase bearer, which the server
        // resolves before the Telegram cookie.
        let token = usedGuestTelegram
          ? getIdentityToken()
          : await readBearerToken();
        let { response, payload } = await requestClaim(token);

        if (response.status === 401) {
          // A cached display name can outlive the signed session. Renew it
          // exactly once, then retry the claim with fresh credentials.
          let refreshedToken: string | null = null;

          if (telegramIdentity) {
            const refreshed = await refreshIdentity({ force: true });

            if (refreshed) refreshedToken = getIdentityToken();
          } else {
            try {
              const { data } = await supabase.auth.refreshSession();
              refreshedToken = data.session?.access_token ?? null;
            } catch {
              // Fall through to a clear expired-session state.
            }
          }

          token = refreshedToken ?? (await readBearerToken());
          ({ response, payload } = await requestClaim(token));
        }

        if (response.status === 401) {
          setAuthExpired(true);
          setRateLimitMsg(
            telegramIdentity
              ? 'Your Telegram session expired. Reopen the Mini App to send a spark.'
              : 'Your session expired. Sign in again to send a spark.'
          );
          setSpark(null);
          setIsLighting(false);
          return;
        }

        if (response.status === 429) {
          const isPersonalCooldown =
            payload?.error === 'cooldown' ||
            typeof payload?.remainingMs === 'number';

          if (isPersonalCooldown) {
            const remainingMs =
              typeof payload?.remainingMs === 'number'
                ? payload.remainingMs
                : VIGIL_COOLDOWN_MS;

            applyCooldown(remainingMs);
            setRateLimitMsg(
              payload?.message || vigilCooldownMessage(remainingMs)
            );
          } else {
            // The per-IP limiter is transient. It must not start a 24-hour
            // personal cooldown or the visitor is locked out locally.
            applyCooldown(0);
            setRateLimitMsg(
              payload?.message ||
                'Too many sparks right now. Please try again in a moment.'
            );
          }

          setSpark(null);
          setIsLighting(false);
          return;
        }

        if (!response.ok) {
          throw new Error(
            payload?.error || 'The spark did not reach the heart.'
          );
        }

        const record = payload?.record as VigilFlameData | undefined;

        setFlameData((current) => ({
          ...(current ?? {
            id: FLAME_ID,
            owner_name: null,
            last_lit_at: null,
          }),
          ...(record ?? {}),
          owner_name: record?.owner_name ?? userName,
        }));
        setNowMs(Date.now());

        // The cooldown is personal; the shared flame is re-read from the same
        // authoritative endpoint the homepage uses.
        applyCooldown(VIGIL_COOLDOWN_MS);
        setAuthExpired(false);
        setSuccessMessage('Spark received · added to the shared heart');
        void refreshSharedFlame();
        void refreshData();

        // Confirmed server completion, not an optimistic tap.
        hapticNotification('success');

        // Animation starts only after the server accepted the claim and only
        // then flies toward the shared heart.
        const end = measureHeartTarget();

        if (end) setSpark({ start: origin, end });
      } catch (error) {
        const aborted =
          typeof error === 'object' &&
          error !== null &&
          (error as { name?: string }).name === 'AbortError';

        console.error('Vigil ritual error:', error);
        hapticNotification('error');
        setSuccessMessage(null);
        setRateLimitMsg(
          aborted
            ? 'The spark took too long to reach the heart. Please try again.'
            : 'The spark did not reach the heart. Please try again.'
        );
        setSpark(null);
        setIsLighting(false);
        return;
      } finally {
        sendingRef.current = false;
      }

      if (sparkTimeoutRef.current) {
        clearTimeout(sparkTimeoutRef.current);
      }

      sparkTimeoutRef.current = setTimeout(() => {
        setSpark(null);
        setIsLighting(false);
        sparkTimeoutRef.current = null;
      }, 1200);
    },
    [
      applyCooldown,
      cooldownRemainingMs,
      getIdentityToken,
      identityIsTelegram,
      isLighting,
      isOnCooldown,
      measureHeartTarget,
      readBearerToken,
      refreshData,
      refreshIdentity,
      refreshSharedFlame,
      startGuestAuthentication,
      userName,
    ]
  );

  return {
    identity,
    reduceMotion,
    angelRef,
    heartRef,
    flameData,
    flameLit,
    flameLabel,
    flameVisuals,
    flameReady,
    flameStatus: sharedFlameStatus,
    flameError: sharedFlameError,
    supporterCount,
    lifetimeTotal,
    uniqueParticipants,
    returningParticipants,
    repeatRate,
    analyticsSince,
    analyticsAvailable,
    isLighting,
    isAuthenticating,
    isOnCooldown,
    cooldownLabel,
    cooldownRemainingMs,
    rateLimitMsg,
    successMessage,
    authExpired,
    retrySession,
    spark,
    userName,
    triggerRitual,
  };
}
