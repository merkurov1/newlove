'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';
import usePrefersReducedMotion from '@/components/pierrot/usePrefersReducedMotion';
import useTempleIdentity from '@/hooks/useTempleIdentity';
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

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [flameData, setFlameData] = useState<VigilFlameData | null>(null);
  const [isLighting, setIsLighting] = useState(false);
  const [spark, setSpark] = useState<VigilSparkPosition | null>(null);
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState<number | null>(
    null
  );

  const userName = identity.displayName;
  const identityIsLoading = identity.isLoading;
  const identitySource = identity.source;
  const refreshIdentity = identity.refresh;

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
        .select('id, owner_name, intention')
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
        { event: '*', schema: 'public', table: 'vigil_hearts' },
        (payload) => {
          const newRow = payload.new as Partial<VigilFlameData> | null;

          if (newRow && newRow.id === FLAME_ID) {
            setFlameData(newRow as VigilFlameData);
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

  // Ask the server for this identity's own cooldown. The public flame timer is
  // never used to infer whether this visitor may spark.
  useEffect(() => {
    if (identityIsLoading || !userName) return;

    let cancelled = false;

    const loadStatus = async (): Promise<VigilStatusResponse | null> => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const response = await fetch('/api/vigil/claim', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : undefined,
        });

        if (!response.ok) return null;

        return (await response.json().catch(() => null)) as
          | VigilStatusResponse
          | null;
      } catch {
        return null;
      }
    };

    const resolveStatus = async () => {
      let status = await loadStatus();

      // A cached Telegram name can survive while the HttpOnly cookie expired.
      // Re-exchange the signed initData once, then retry.
      if (
        !cancelled &&
        status &&
        status.authenticated === false &&
        identitySource === 'telegram' &&
        !statusRetryRef.current
      ) {
        statusRetryRef.current = true;
        const refreshed = await refreshIdentity();

        if (refreshed && !cancelled) status = await loadStatus();
      }

      if (cancelled || !status?.authenticated) return;

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
    identityIsLoading,
    refreshIdentity,
    identitySource,
    userName,
  ]);

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

  const triggerRitual = useCallback(
    async (event?: React.MouseEvent<HTMLButtonElement>) => {
      if (isLighting) return;

      if (!userName) {
        setSuccessMessage(null);
        setRateLimitMsg(
          identity.isTelegram
            ? identity.error || 'We could not confirm your Telegram name yet.'
            : 'Please sign in to participate.'
        );
        return;
      }

      if (isOnCooldown) {
        setSuccessMessage(null);
        setRateLimitMsg(vigilCooldownMessage(cooldownRemainingMs ?? 0));
        return;
      }

      setIsLighting(true);
      setRateLimitMsg(null);
      setSuccessMessage(null);

      // The spark begins exactly where the visitor acted. Keyboard activation
      // falls back to the centre of the button.
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

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const requestClaim = async () => {
          const response = await fetch('/api/vigil/claim', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token
                ? { Authorization: `Bearer ${session.access_token}` }
                : {}),
            },
            body: JSON.stringify({ id: FLAME_ID }),
          });

          const payload = await response.json().catch(() => null);

          return { response, payload };
        };

        let { response, payload } = await requestClaim();

        if (response.status === 401 && identity.source === 'telegram') {
          const refreshed = await identity.refresh();

          if (refreshed) ({ response, payload } = await requestClaim());
        }

        if (response.status === 429) {
          const remainingMs =
            typeof payload?.remainingMs === 'number'
              ? payload.remainingMs
              : VIGIL_COOLDOWN_MS;

          applyCooldown(remainingMs);
          setRateLimitMsg(
            payload?.message || vigilCooldownMessage(remainingMs)
          );
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
        console.error('Vigil ritual error:', error);
        hapticNotification('error');
        setSuccessMessage(null);
        setRateLimitMsg(
          'The spark did not reach the heart. Please try again.'
        );
        setSpark(null);
        setIsLighting(false);
        return;
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
      identity,
      isLighting,
      isOnCooldown,
      measureHeartTarget,
      refreshData,
      refreshSharedFlame,
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
    isOnCooldown,
    cooldownLabel,
    cooldownRemainingMs,
    rateLimitMsg,
    successMessage,
    spark,
    userName,
    triggerRitual,
  };
}
