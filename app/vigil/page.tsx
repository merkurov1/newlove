'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { useAuth } from '@/components/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Clock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import TempleTopBar from '@/components/TempleTopBar';
import Image from 'next/image';
import { logTempleEvent } from '@/lib/templeLogger';

const ANGEL_GIF =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';

const FLAME_ID = 1;

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
  const { user, profile, isLoading } = useAuth();

  const angelRef = useRef<HTMLDivElement | null>(null);
  const heartRef = useRef<HTMLDivElement | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sparkTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const [intensity, setIntensity] = useState(1);
  const [timeLeft, setTimeLeft] = useState('');
  const [flameData, setFlameData] = useState<FlameData | null>(null);
  const [guardians, setGuardians] = useState<string[]>([]);

  const [isLighting, setIsLighting] = useState(false);
  const [spark, setSpark] = useState<SparkPosition | null>(null);
  const [rateLimitMsg, setRateLimitMsg] =
    useState<string | null>(null);

  const userName =
    profile?.name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    '';

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
    if (!flameData?.last_lit_at) {
      setTimeLeft('');
      return;
    }

    const lastLitTime = new Date(
      flameData.last_lit_at
    ).getTime();

    if (!Number.isFinite(lastLitTime)) {
      setTimeLeft('');
      return;
    }

    const diff = Date.now() - lastLitTime;

    const remaining =
      24 * 60 * 60 * 1000 - diff;

    if (remaining <= 0) {
      setTimeLeft('FLAME EXTINGUISHED');
      return;
    }

    const h = Math.floor(
      remaining / 3600000
    );

    const m = Math.floor(
      (remaining % 3600000) / 60000
    );

    setTimeLeft(
      `${h}h ${m}m remaining`
    );
  }, [flameData]);

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

    timerRef.current = setInterval(
      updateTimer,
      1000
    );

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
    };
  }, [calculateIntensity, refreshData, updateTimer]);

  useEffect(() => {
    updateTimer();
  }, [updateTimer]);

  const triggerRitual = async () => {
    if (isLighting || !userName) {
      return;
    }

    setIsLighting(true);
    setRateLimitMsg(null);

    try {
      const {
        data: userLogs,
        error: userLogsError,
      } = await supabase
        .from('temple_log')
        .select('created_at')
        .in('event_type', [
          'vigil_spark',
          'VIGIL_SPARK',
        ])
        .eq('author', userName)
        .order('created_at', {
          ascending: false,
        })
        .limit(1);

      if (userLogsError) {
        console.error(
          'Vigil cooldown lookup error:',
          userLogsError
        );
      }

      if (
        userLogs &&
        userLogs.length > 0
      ) {
        const lastCreatedAt =
          userLogs[0].created_at;

        const lastLitTime = new Date(
          lastCreatedAt
        ).getTime();

        if (Number.isFinite(lastLitTime)) {
          const diff =
            Date.now() - lastLitTime;

          const cooldownMs =
            24 * 60 * 60 * 1000;

          if (diff < cooldownMs) {
            const remain =
              cooldownMs - diff;

            const h = Math.floor(
              remain / 3600000
            );

            const m = Math.floor(
              (remain % 3600000) / 60000
            );

            setRateLimitMsg(
              `You can light the heart again in ${h}h ${m}m.`
            );

            setIsLighting(false);

            return;
          }
        }
      }
    } catch (error) {
      console.error(
        'Vigil cooldown check error:',
        error
      );
    }

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

    try {
      const nowISO =
        new Date().toISOString();

      const { error: updateError } =
        await supabase
          .from('vigil_hearts')
          .update({
            owner_name: userName,
            last_lit_at: nowISO,
          })
          .eq('id', FLAME_ID);

      if (updateError) {
        throw updateError;
      }

      await logTempleEvent({
        message: `${userName} transmitted a spark`,
        event_type: 'VIGIL_SPARK',
        author: userName,
      });

      setFlameData((current) => ({
        ...(current ?? {
          id: FLAME_ID,
          owner_name: null,
          last_lit_at: null,
        }),
        owner_name: userName,
        last_lit_at: nowISO,
      }));
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

  return (
    <main
      className={`relative w-full min-h-[100dvh] ${roomTheme.bg} ${roomTheme.text} font-sans overflow-x-hidden select-none flex flex-col justify-between p-6 pt-36 sm:px-12 sm:pb-12 sm:pt-36 md:p-12 transition-colors duration-1000`}
      style={{
        backgroundImage: roomTheme.vignette,
      }}
    >
      <TempleTopBar />

      {/* Мягкое внутреннее свечение в темной комнате */}
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-tr ${roomTheme.glow} blur-[120px] pointer-events-none`}
      />

      {/* Ангел в темной комнате */}
      <div
        ref={angelRef}
        className="absolute left-[8%] bottom-[8%] sm:left-[15%] sm:bottom-[15%] z-10 md:z-30 flex flex-col items-center pointer-events-none"
      >
        <div className="absolute -bottom-2 w-32 h-6 bg-black/40 rounded-full blur-[10px]" />

        <div
          className={`absolute inset-0 bg-amber-600/15 blur-3xl rounded-full transition-all duration-700 ${
            isLighting
              ? 'opacity-100 scale-150'
              : 'opacity-40'
          }`}
        />

        <div className="relative w-32 h-40 sm:w-44 sm:h-52 flex items-end justify-center drop-shadow-[0_20px_35px_rgba(0,0,0,0.6)]">
          <Image
            src={ANGEL_GIF}
            alt="Guardian Angel"
            fill
            className={`object-contain transition-all duration-500 ${
              isLighting
                ? 'brightness-125 scale-105 drop-shadow-[0_0_30px_rgba(255,165,0,0.8)]'
                : ''
            }`}
            priority
            unoptimized
          />
        </div>
      </div>

      {/* Живое сердце */}
      <div
        ref={heartRef}
        className="relative z-10 flex h-32 w-full shrink-0 items-center justify-center mb-5 md:absolute md:top-[30%] md:right-[20%] md:h-auto md:w-auto md:mb-0 md:z-30"
      >
        <div
          className="relative transition-all duration-700 ease-in-out cursor-pointer"
          style={{
            transform: `scale(${
              0.9 + (intensity / 10) * 0.4
            })`,
          }}
        >
          <motion.div
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.4, 0.75, 0.4],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="w-32 h-32 sm:w-44 sm:h-44 bg-gradient-to-t from-orange-600 via-rose-600 to-transparent rounded-full blur-[45px] opacity-75 mix-blend-screen"
          />

          <div className="absolute inset-0 flex items-center justify-center">
            <Heart
              size={65 + intensity * 3}
              className="text-stone-100 fill-orange-600/30 drop-shadow-[0_0_35px_rgba(255,140,0,0.8)] stroke-[1.5]"
            />
          </div>
        </div>

        <AnimatePresence>
          {spark && (
            <motion.div
              initial={{
                x: 0,
                y: 0,
                opacity: 0,
                scale: 0.5,
              }}
              animate={{
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
                opacity: [
                  0,
                  1,
                  1,
                  0,
                ],
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
              }}
              exit={{
                opacity: 0,
              }}
              transition={{
                duration: 1.25,
                times: [
                  0,
                  0.35,
                  0.82,
                  1,
                ],
                ease: [
                  0.22,
                  1,
                  0.36,
                  1,
                ],
              }}
              className="fixed z-50 pointer-events-none flex items-center justify-center"
              style={{
                left: spark.start.x,
                top: spark.start.y,
              }}
            >
              <div className="w-10 h-10 bg-amber-300 rounded-full blur-[3px] shadow-[0_0_30px_10px_#ff9900]" />
              <div className="absolute w-4 h-4 bg-white rounded-full shadow-[0_0_15px_4px_#ffffff]" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Центральный блок управления */}
      <div className="flex-1 max-w-md mx-auto w-full py-5 md:py-12 flex flex-col items-center justify-center relative z-20 my-auto">
        <div
          className={`w-full p-5 sm:p-8 rounded-3xl border backdrop-blur-xl ${roomTheme.cardBg} flex flex-col items-center gap-5 sm:gap-6 text-center shadow-2xl`}
        >
          <div className="w-full space-y-3">
            <div className="font-mono text-xs uppercase tracking-[0.3em] opacity-70">
              Active Guardians (24h)
            </div>

            <div className="flex flex-wrap gap-2 justify-center items-center min-h-[40px]">
              {guardians.length === 0 ? (
                <div className="font-serif text-sm opacity-50 italic">
                  No recent sparks recorded yet. Be the first.
                </div>
              ) : (
                guardians.map((guardian, index) => (
                  <div
                    key={`${guardian}-${index}`}
                    className={`font-serif text-xs sm:text-sm px-3.5 py-1.5 rounded-full border shadow-sm transition-transform hover:scale-105 ${roomTheme.buttonClass}`}
                  >
                    {guardian}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="w-full h-[1px] bg-white/10" />

          <div className="w-full space-y-4">
            <div className="text-center space-y-1.5">
              <div className="font-mono text-xs">
                {isLoading ? (
                  <span className="opacity-50">
                    Verifying session...
                  </span>
                ) : userName ? (
                  <div className="opacity-90">
                    Connected as{' '}
                    <span className="font-semibold">
                      {userName}
                    </span>
                  </div>
                ) : (
                  <div className="text-amber-400 flex items-center justify-center gap-1.5">
                    <Sparkles size={14} />

                    <span>
                      Please{' '}
                      <Link
                        href="/login"
                        className="underline hover:opacity-80"
                      >
                        sign in
                      </Link>{' '}
                      to participate
                    </span>
                  </div>
                )}
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
            </div>

            <button
              type="button"
              onClick={triggerRitual}
              disabled={
                isLighting || !userName
              }
              className={`
                group relative w-full h-12 border backdrop-blur-md shadow-md
                flex items-center justify-center gap-2.5 rounded-full
                transition-all active:scale-95 disabled:opacity-40 cursor-pointer font-serif text-xs tracking-widest uppercase
                ${roomTheme.buttonClass}
              `}
            >
              <Heart
                size={14}
                className={`text-orange-500 fill-orange-500/30 ${
                  isLighting
                    ? 'animate-bounce'
                    : ''
                }`}
              />

              <span>
                {isLighting
                  ? 'Transmitting Spark...'
                  : 'Send Spark'}
              </span>
            </button>

            {rateLimitMsg && (
              <div
                className="font-mono text-xs text-rose-400 text-center"
                role="status"
              >
                {rateLimitMsg}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="h-4" />
    </main>
  );
}