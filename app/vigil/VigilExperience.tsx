'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Clock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import TempleTopBar from '@/components/TempleTopBar';
import Image from 'next/image';
import { useRitualModalTimer } from '@/components/temple/useRitualModalTimer';
import { useVigilController } from './useVigilController';
import VigilShare from '@/components/vigil/VigilShare';
import useIsTelegram from '@/components/useIsTelegram';
import { useTelegramBottomButton } from '@/components/telegram/useTelegramBottomButton';
import { hapticImpact } from '@/lib/telegram/webApp';
import { vigilHeartHeat } from '@/lib/vigil/flame';

const ANGEL_GIF =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';

// Постоянная тема темной комнаты / часовни
const roomTheme = {
  bg: 'bg-[#141210]',
  text: 'text-stone-200',
  glow: 'from-amber-900/40 via-orange-950/20 to-transparent',
  vignette:
    'radial-gradient(circle at 50% 40%, rgba(55, 40, 32, 0.75) 0%, rgba(20, 18, 16, 1) 90%)',
  cardBg:
    'bg-stone-900/90 border-stone-800/80 text-stone-100 shadow-2xl',
  buttonClass:
    'bg-white/10 border-white/20 text-stone-200 hover:bg-white/20',
};

export default function VigilExperience() {
  const {
    identity,
    reduceMotion,
    angelRef,
    heartRef,
    guardians,
    flameData,
    flameLit,
    flameLabel,
    isLighting,
    isOnCooldown,
    cooldownLabel,
    rateLimitMsg,
    spark,
    userName,
    triggerRitual,
  } = useVigilController();

  const isTelegram = useIsTelegram();

  useTelegramBottomButton({
    text: isOnCooldown ? `SPARK RETURNS IN ${cooldownLabel}` : 'SEND SPARK',
    visible: isTelegram,
    enabled: Boolean(userName) && !isLighting && !isOnCooldown,
    onClick: () => {
      hapticImpact('vigil');
      void triggerRitual();
    },
  });

  // Publish the shared flame clock to the modal header. The visual intensity
  // below uses the same value, so the timer and the heart can never disagree.
  useRitualModalTimer(flameData ? flameLabel : null);

  const heat = vigilHeartHeat(flameLit, guardians.length);
  const heartScale = flameLit ? 0.9 + (heat / 10) * 0.35 : 0.8;
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
          <span className="font-semibold">{userName}</span>
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
      style={{ backgroundImage: roomTheme.vignette }}
    >
      <TempleTopBar backTo="temple" />

      <h1 className="relative z-20 mx-auto w-full max-w-5xl px-1 font-serif text-xs uppercase tracking-[0.3em] text-stone-400">
        Vigil — Digital Temple
      </h1>

      {/* Мягкое внутреннее свечение в темной комнате */}
      <div
        className={`pointer-events-none absolute top-1/2 left-1/2 z-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr ${roomTheme.glow} blur-[120px] transition-opacity duration-700`}
        style={{ opacity: flameLit ? 1 : 0.15 }}
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
                isLighting ? 'scale-150 opacity-100' : 'opacity-40'
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
              style={{ transform: `scale(${heartScale})` }}
            >
              <motion.div
                animate={
                  !flameLit || reduceMotion
                    ? { opacity: flameLit ? 0.45 : 0, scale: 1 }
                    : {
                        scale: [1, 1.15, 1],
                        opacity: [0.4, 0.75, 0.4],
                      }
                }
                transition={
                  !flameLit || reduceMotion
                    ? { duration: 0 }
                    : {
                        duration: 2.5,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }
                }
                className="h-32 w-32 rounded-full bg-gradient-to-t from-orange-600 via-rose-600 to-transparent mix-blend-screen blur-[45px] sm:h-44 sm:w-44"
              />

              <div className="absolute inset-0 flex items-center justify-center">
                <Heart
                  size={65 + heat * 3}
                  className={`transition-all duration-700 ${
                    flameLit
                      ? 'fill-orange-600/30 text-stone-100 drop-shadow-[0_0_35px_rgba(255,140,0,0.8)]'
                      : 'fill-stone-700/20 text-stone-500'
                  } stroke-[1.5]`}
                />
              </div>
            </div>

            <AnimatePresence>
              {spark && (
                <motion.div
                  initial={
                    reduceMotion
                      ? { opacity: 0, scale: 1 }
                      : { x: 0, y: 0, opacity: 0, scale: 0.5 }
                  }
                  animate={
                    reduceMotion
                      ? { opacity: [0, 1, 0], scale: 1 }
                      : {
                          x: [
                            0,
                            (spark.end.x - spark.start.x) * 0.45,
                            spark.end.x - spark.start.x,
                          ],
                          y: [
                            0,
                            -90,
                            spark.end.y - spark.start.y,
                          ],
                          opacity: [0, 1, 1, 0],
                          scale: [0.55, 1.8, 1.35, 0.25],
                          rotate: [0, 18, -12, 0],
                        }
                  }
                  exit={{ opacity: 0 }}
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
                  style={{ left: spark.start.x, top: spark.start.y }}
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
                <div className="font-mono text-xs">{identityStatus}</div>

                <div className="flex items-center justify-center gap-2">
                  <Clock size={13} className="text-amber-400" />
                  <span
                    className={`font-mono text-xs uppercase tracking-wider ${
                      flameLit ? 'opacity-85' : 'text-stone-500'
                    }`}
                    aria-live="polite"
                  >
                    {flameData ? flameLabel : 'Checking status...'}
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
                    {flameLit ? 'Heart lit by' : 'Last spark by'}{' '}
                    <span className="font-semibold text-amber-100">
                      {flameData.owner_name}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={(event) => void triggerRitual(event)}
                disabled={isLighting || !userName || isOnCooldown}
                aria-busy={isLighting}
                className="group relative flex h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-full border border-white/20 bg-white/10 font-serif text-xs uppercase tracking-widest text-stone-200 shadow-md backdrop-blur-md transition-all hover:bg-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Heart
                  size={14}
                  className={`text-orange-500 ${
                    flameLit ? 'fill-orange-500/30' : ''
                  } ${isLighting ? 'animate-bounce' : ''}`}
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

              {isOnCooldown && (
                <div className="pt-1">
                  <VigilShare />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
