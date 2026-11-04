'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Clock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import TempleTopBar from '@/components/TempleTopBar';
import Image from 'next/image';
import usePrefersReducedMotion from '@/components/pierrot/usePrefersReducedMotion';
import useTempleIdentity from '@/hooks/useTempleIdentity';
import {
  VIGIL_COOLDOWN_MS,
  formatVigilCooldown,
  vigilCooldownMessage,
} from '@/lib/vigil/cooldown';

const ANGEL_GIF =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';

const FLAME_ID = 1;
const CLOCK_REFRESH_MS = 30_000;

type FlameData = {
  id: number;
  owner_name: string | null;
  last_lit_at: string | null;
  [key: string]: unknown;
};

type TempleLogRow = {
  author: string | null;
  message: string | null;
  created_at: string;
};

type SparkPosition = {
  start: {
    x: number;
    y: number;
  };
  end: {
    x: number;
    y: number;
  };
};

type VigilStatusResponse = {
  authenticated?: boolean;
  canSpark?: boolean;
  remainingMs?: number;
  remainingLabel?: string;
  lastSparkAt?: string | null;
};

// Постоянная тема темной комнаты / часовни
const roomTheme = {
  bg: 'bg-[#141210]',
  text: 'text-stone-200',
  subText: 'text-stone-400',
  glow: 'from-amber-900/40 via-orange-950/20 to-transparent',
  vignette:
    'radial-gradient(circle at 50% 40%, rgba(55, 40, 32, 0.75) 0%, rgba(20, 18, 16, 1) 90%)',
  cardBg:
    'bg-stone-900/90 border-stone-800/80 text-stone-100 shadow-2xl',
  buttonClass:
    'bg-white/10 border-white/20 text-stone-200 hover:bg-white/20',
};

export default function VigilPage() {
  const identity = useTempleIdentity();
  const reduceMotion = usePrefersReducedMotion();

  const angelRef = useRef<HTMLDivElement | null>(null);
  const heartRef = useRef<HTMLDivElement | null>(null);
  const flameDataRef = useRef<FlameData | null>(null);
  const cooldownEndsAtRef = useRef<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sparkTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRetryRef = useRef(false);

  const [intensity, setIntensity] = useState(1);
  const [timeLeft, setTimeLeft] = useState('');
  const [flameData, setFlameData] = useState<FlameData | null>(null);
  const [guardians, setGuardians] = useState<string[]>([]);

  const [isLighting, setIsLighting] = useState(false);
  const [spark, setSpark] = useState<SparkPosition | null>(null);
  const [rateLimitMsg, setRateLimitMsg] =
    useState<string | null>(null);
  const [cooldownRemainingMs, setCooldownRemainingMs] =
    useState<number | null>(null);

  const userName = identity.displayName;
  const identityIsLoading = identity.isLoading;
  const identitySource = identity.source;
  const refreshIdentity = identity.refresh;
  const isOnCooldown =
    cooldownRemainingMs !== null && cooldownRemainingMs > 0;
  const cooldownLabel = isOnCooldown
    ? formatVigilCooldown(cooldownRemainingMs)
    : '';

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

  const refreshGuardians = useCallback(
    async (): Promise<number> => {
      try {
        const yesterday = new Date(
          Date.now() - 24 * 60 * 60 * 1000
        ).toISOString();

        const { data, error } = await supabase
          .from('temple_log')
          .select('author, message, created_at')
          .in('event_type', ['vigil_spark', 'VIGIL_SPARK'])
          .gt('created_at', yesterday)
          .order('created_at', {
            ascending: false,
          })
          .limit(100);

        if (error) {
          console.error(
            'Vigil guardians error:',
            error
          );
          return 0;
        }

        if (!data) {
          return 0;
        }

        const rows = data as TempleLogRow[];
        const names: string[] = [];

        rows.forEach((row) => {
          if (row.author?.trim()) {
            names.push(row.author.trim());
            return;
          }

          if (row.message?.trim()) {
            const parts = row.message.trim().split(/\s+/);

            if (parts[0]) {
              names.push(parts[0].trim());
            }
          }
        });

        const unique = Array.from(new Set(names));

        setGuardians(unique.slice(0, 8));

        return unique.length;
      } catch (error) {
        console.error(
          'Vigil guardians exception:',
          error
        );

        return 0;
      }
    },
    []
  );

  const calculateIntensity = useCallback(async () => {
    const uniqueCount = await refreshGuardians();

    const level = Math.min(
      10,
      Math.max(1, uniqueCount)
    );

    setIntensity(level);
  }, [refreshGuardians]);

  const refreshData = useCallback(async () => {
    try {
      const {
        data: flame,
        error,
      } = await supabase
        .from('vigil_hearts')
        .select('*')
        .eq('id', FLAME_ID)
        .maybeSingle();

      if (error) {
        console.error(
          'Vigil flame error:',
          error
        );
      } else if (flame) {
        setFlameData(flame as FlameData);
      }

      await calculateIntensity();
    } catch (error) {
      console.error(
        'Vigil refresh error:',
        error
      );
    }
  }, [calculateIntensity]);

  const updateTimer = useCallback(() => {
    const lastLitAt = flameDataRef.current?.last_lit_at;

    if (!lastLitAt) {
      setTimeLeft('');
      return;
    }

    const lastLitTime = new Date(lastLitAt).getTime();

    if (!Number.isFinite(lastLitTime)) {
      setTimeLeft('');
      return;
    }

    const diff = Date.now() - lastLitTime;
    const remaining = VIGIL_COOLDOWN_MS - diff;

    if (remaining <= 0) {
      setTimeLeft('FLAME EXTINGUISHED');
      return;
    }

    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);

    setTimeLeft(`${h}h ${m}m remaining`);
  }, []);

  const updateCooldownClock = useCallback(() => {
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
    flameDataRef.current = flameData;
    updateTimer();
  }, [flameData, updateTimer]);

  useEffect(() => {
    void refreshData();

    const channel = supabase
      .channel('vigil_live_sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vigil_hearts',
        },
        (payload) => {
          const newRow =
            payload.new as Partial<FlameData> | null;

          if (
            newRow &&
            newRow.id === FLAME_ID
          ) {
            setFlameData(
              newRow as FlameData
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'temple_log',
        },
        (payload) => {
          const newRow = payload.new as {
            event_type?: string | null;
          };

          if (
            String(
              newRow?.event_type || ''
            ).toUpperCase() === 'VIGIL_SPARK'
          ) {
            void calculateIntensity();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error(
            'Vigil realtime channel error'
          );
        }
      });

    // Minute-level precision is enough. The interval is created once and is
    // never recreated by flame or cooldown state changes.
    timerRef.current = setInterval(() => {
      updateTimer();
      updateCooldownClock();
    }, CLOCK_REFRESH_MS);

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;

      updateTimer();
      updateCooldownClock();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      supabase.removeChannel(channel);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (sparkTimeoutRef.current) {
        clearTimeout(
          sparkTimeoutRef.current
        );

        sparkTimeoutRef.current = null;
      }

      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      );
    };
  }, [
    calculateIntensity,
    refreshData,
    updateCooldownClock,
    updateTimer,
  ]);

  // Ask the server for this identity's own cooldown. The public flame timer is
  // not used to infer whether this visitor may spark.
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
            ? {
                Authorization: `Bearer ${session.access_token}`,
              }
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

        if (refreshed && !cancelled) {
          status = await loadStatus();
        }
      }

      if (cancelled || !status?.authenticated) return;

      applyCooldown(
        typeof status.remainingMs === 'number'
          ? status.remainingMs
          : 0
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

  const triggerRitual = async () => {
    if (isLighting) return;

    if (!userName) {
      setRateLimitMsg(
        identity.isTelegram
          ? identity.error ||
              'Telegram identity is not available yet.'
          : 'Please sign in to participate.'
      );
      return;
    }

    if (isOnCooldown) {
      setRateLimitMsg(
        vigilCooldownMessage(cooldownRemainingMs ?? 0)
      );
      return;
    }

    setIsLighting(true);
    setRateLimitMsg(null);

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
              ? {
                  Authorization: `Bearer ${session.access_token}`,
                }
              : {}),
          },
          body: JSON.stringify({
            id: FLAME_ID,
          }),
        });

        const payload = await response
          .json()
          .catch(() => null);

        return { response, payload };
      };

      let { response, payload } = await requestClaim();

      if (
        response.status === 401 &&
        identity.source === 'telegram'
      ) {
        const refreshed = await identity.refresh();

        if (refreshed) {
          ({ response, payload } = await requestClaim());
        }
      }

      if (response.status === 429) {
        const remainingMs =
          typeof payload?.remainingMs === 'number'
            ? payload.remainingMs
            : VIGIL_COOLDOWN_MS;

        applyCooldown(remainingMs);

        setRateLimitMsg(
          payload?.message ||
            vigilCooldownMessage(remainingMs)
        );

        setSpark(null);
        setIsLighting(false);

        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.error ||
            `Vigil claim failed (${response.status})`
        );
      }

      const record = payload?.record as
        | FlameData
        | undefined;

      const nowISO = new Date().toISOString();

      setFlameData((current) => ({
        ...(current ?? {
          id: FLAME_ID,
          owner_name: null,
          last_lit_at: null,
        }),
        ...(record ?? {}),
        owner_name:
          record?.owner_name ?? userName,
        last_lit_at:
          record?.last_lit_at ?? nowISO,
      }));

      applyCooldown(VIGIL_COOLDOWN_MS);
      void calculateIntensity();

      if (
        angelRef.current &&
        heartRef.current
      ) {
        const angelRect =
          angelRef.current.getBoundingClientRect();

        const heartRect =
          heartRef.current.getBoundingClientRect();

        setSpark({
          start: {
            x:
              angelRect.left +
              angelRect.width / 2,
            y:
              angelRect.top +
              angelRect.height / 2,
          },
          end: {
            x:
              heartRect.left +
              heartRect.width / 2,
            y:
              heartRect.top +
              heartRect.height / 2,
          },
        });
      }
    } catch (error) {
      console.error(
        'Vigil ritual error:',
        error
      );

      setRateLimitMsg(
        'The spark could not be transmitted. Please try again.'
      );

      setSpark(null);
      setIsLighting(false);

      return;
    }

    if (sparkTimeoutRef.current) {
      clearTimeout(
        sparkTimeoutRef.current
      );
    }

    sparkTimeoutRef.current =
      setTimeout(() => {
        setSpark(null);
        setIsLighting(false);
        sparkTimeoutRef.current = null;
      }, 1200);
  };

  const identityStatus = (() => {
    if (identity.isLoading) {
      return (
        <span className="opacity-50">
          Preparing your Temple identity...
        </span>
      );
    }

    if (userName) {
      return (
        <div className="opacity-90">
          Connected as{' '}
          <span className="font-semibold">
            {userName}
          </span>
        </div>
      );
    }

    if (identity.isTelegram) {
      return (
        <div className="text-amber-400/90">
          {identity.error ||
            'Telegram identity is not available. You can still witness the Vigil.'}
          {identity.error && (
            <button
              type="button"
              onClick={() => void identity.refresh()}
              className="ml-2 min-h-[44px] align-middle underline underline-offset-2 hover:opacity-80"
            >
              Retry
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="text-amber-400 flex items-center justify-center gap-1.5">
        <Sparkles size={14} />

        <span>
          Please{' '}
          <Link
            href="/login?next=%2Fvigil"
            className="underline hover:opacity-80"
          >
            sign in
          </Link>{' '}
          to participate
        </span>
      </div>
    );
  })();

  return (
    <div
      className={`vigil-page relative w-full ${roomTheme.bg} ${roomTheme.text} font-sans overflow-x-hidden select-none flex flex-col px-5 sm:px-10`}
      style={{
        backgroundImage: roomTheme.vignette,
      }}
    >
      <TempleTopBar />

      <h1 className="relative z-20 mx-auto w-full max-w-5xl px-1 font-serif text-xs uppercase tracking-[0.3em] text-stone-400">
        Vigil — Digital Temple
      </h1>

      {/* Мягкое внутреннее свечение в темной комнате */}
      <div
        className={`pointer-events-none absolute top-1/2 left-1/2 z-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr ${roomTheme.glow} blur-[120px]`}
      />

      <div className="vigil-stage relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 py-3 lg:max-w-5xl lg:gap-0 lg:py-6">
        {/*
          On phones and tablets the Angel and the Heart sit together above the
          control panel, so neither is hidden behind it. From large screens the
          original side composition returns.
        */}
        <div className="vigil-art flex w-full items-end justify-between gap-4 lg:contents">
          <div
            ref={angelRef}
            className="pointer-events-none relative z-10 flex shrink-0 flex-col items-center lg:absolute lg:bottom-[14%] lg:left-[6%] lg:z-30"
          >
            <div className="absolute -bottom-2 h-5 w-24 rounded-full bg-black/40 blur-[10px] sm:w-32" />

            <div
              className={`absolute inset-0 rounded-full bg-amber-600/15 blur-3xl transition-all duration-700 ${
                isLighting
                  ? 'scale-150 opacity-100'
                  : 'opacity-40'
              }`}
            />

            <div className="relative flex h-32 w-24 items-end justify-center drop-shadow-[0_20px_35px_rgba(0,0,0,0.6)] sm:h-44 sm:w-36 lg:h-52 lg:w-44">
              <Image
                src={ANGEL_GIF}
                alt="Guardian Angel"
                fill
                sizes="(min-width: 1024px) 176px, 144px"
                className={`object-contain transition-all duration-500 ${
                  isLighting
                    ? 'scale-105 brightness-125 drop-shadow-[0_0_30px_rgba(255,165,0,0.8)]'
                    : ''
                }`}
                priority
                unoptimized
              />
            </div>
          </div>

          <div
            ref={heartRef}
            className="relative z-10 flex h-32 w-32 shrink-0 items-center justify-center sm:h-44 sm:w-44 lg:absolute lg:right-[7%] lg:top-[26%] lg:z-30 lg:h-auto lg:w-auto"
          >
            <div
              className="relative transition-all duration-700 ease-in-out"
              style={{
                transform: `scale(${
                  0.9 + (intensity / 10) * 0.4
                })`,
              }}
            >
              <motion.div
                animate={
                  reduceMotion
                    ? { opacity: 0.6 }
                    : {
                        scale: [1, 1.15, 1],
                        opacity: [0.4, 0.75, 0.4],
                      }
                }
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        duration: 2.5,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }
                }
                className="h-32 w-32 rounded-full bg-gradient-to-t from-orange-600 via-rose-600 to-transparent opacity-75 mix-blend-screen blur-[45px] sm:h-44 sm:w-44"
              />

              <div className="absolute inset-0 flex items-center justify-center">
                <Heart
                  size={65 + intensity * 3}
                  className="fill-orange-600/30 text-stone-100 drop-shadow-[0_0_35px_rgba(255,140,0,0.8)] stroke-[1.5]"
                />
              </div>
            </div>

            <AnimatePresence>
              {spark && (
                <motion.div
                  initial={
                    reduceMotion
                      ? { opacity: 0, scale: 1 }
                      : {
                          x: 0,
                          y: 0,
                          opacity: 0,
                          scale: 0.5,
                        }
                  }
                  animate={
                    reduceMotion
                      ? { opacity: [0, 1, 0], scale: 1 }
                      : {
                          x: [
                            0,
                            (spark.end.x -
                              spark.start.x) *
                              0.45,
                            spark.end.x -
                              spark.start.x,
                          ],
                          y: [
                            0,
                            -90,
                            spark.end.y -
                              spark.start.y,
                          ],
                          opacity: [0, 1, 1, 0],
                          scale: [
                            0.55,
                            1.8,
                            1.35,
                            0.25,
                          ],
                          rotate: [
                            0,
                            18,
                            -12,
                            0,
                          ],
                        }
                  }
                  exit={{
                    opacity: 0,
                  }}
                  transition={
                    reduceMotion
                      ? { duration: 0.8 }
                      : {
                          duration: 1.25,
                          times: [0, 0.35, 0.82, 1],
                          ease: [0.22, 1, 0.36, 1],
                        }
                  }
                  className="pointer-events-none fixed z-50 flex items-center justify-center"
                  style={{
                    left: spark.start.x,
                    top: spark.start.y,
                  }}
                >
                  <div className="h-10 w-10 rounded-full bg-amber-300 shadow-[0_0_30px_10px_#ff9900] blur-[3px]" />
                  <div className="absolute h-4 w-4 rounded-full bg-white shadow-[0_0_15px_4px_#ffffff]" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Центральный блок управления */}
        <div className="vigil-control relative z-20 flex w-full max-w-md flex-col items-center justify-center">
          <div
            className={`flex w-full flex-col items-center gap-5 rounded-3xl border p-5 text-center backdrop-blur-xl sm:gap-6 sm:p-7 ${roomTheme.cardBg} shadow-2xl`}
          >
            <div className="w-full space-y-3">
              <div className="font-mono text-xs uppercase tracking-[0.3em] opacity-70">
                Active Guardians (24h)
              </div>

              <div className="flex min-h-[40px] flex-wrap items-center justify-center gap-2">
                {guardians.length === 0 ? (
                  <div className="font-serif text-sm italic opacity-50">
                    No recent sparks recorded yet. Be the first.
                  </div>
                ) : (
                  guardians.map((guardian, index) => (
                    <div
                      key={`${guardian}-${index}`}
                      className={`max-w-[12rem] truncate rounded-full border px-3.5 py-1.5 font-serif text-xs shadow-sm transition-transform hover:scale-105 sm:text-sm ${roomTheme.buttonClass}`}
                    >
                      {guardian}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="h-[1px] w-full bg-white/10" />

            <div className="w-full space-y-4">
              <div className="space-y-1.5 text-center">
                <div className="font-mono text-xs">
                  {identityStatus}
                </div>

                <div className="flex items-center justify-center gap-2">
                  <Clock
                    size={13}
                    className="text-amber-400"
                  />

                  <span className="font-mono text-xs uppercase tracking-wider opacity-85">
                    {timeLeft ||
                      'Checking status...'}
                  </span>
                </div>

                {isOnCooldown && (
                  <div
                    className="font-mono text-[11px] uppercase tracking-[0.14em] text-amber-300/80"
                    aria-live="polite"
                  >
                    Next spark in {cooldownLabel}
                  </div>
                )}

                {flameData?.owner_name && (
                  <div
                    className="font-serif text-sm text-amber-200/90"
                    aria-live="polite"
                  >
                    {timeLeft ===
                    'FLAME EXTINGUISHED'
                      ? 'Last spark by'
                      : 'Heart lit by'}{' '}
                    <span className="font-semibold text-amber-100">
                      {flameData.owner_name}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={triggerRitual}
                disabled={
                  isLighting || !userName || isOnCooldown
                }
                aria-busy={isLighting}
                className={`
                  group relative flex h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-full border border-white/20 bg-white/10 font-serif text-xs uppercase tracking-widest text-stone-200 shadow-md backdrop-blur-md transition-all hover:bg-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40
                `}
              >
                <Heart
                  size={14}
                  className={`fill-orange-500/30 text-orange-500 ${
                    isLighting
                      ? 'animate-bounce'
                      : ''
                  }`}
                />

                <span>
                  {isLighting
                    ? 'Transmitting Spark...'
                    : isOnCooldown
                      ? `Spark returns in ${cooldownLabel}`
                      : 'Send Spark'}
                </span>
              </button>

              {rateLimitMsg && (
                <div
                  className="text-center font-mono text-xs text-rose-400"
                  role="status"
                >
                  {rateLimitMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
