'use client';

import { type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';

import TempleTopBar from '@/components/TempleTopBar';
import { useRitualModalTimer } from '@/components/temple/useRitualModalTimer';
import useIsTelegram from '@/components/useIsTelegram';
import { useTelegramBottomButton } from '@/components/telegram/useTelegramBottomButton';
import { hapticImpact } from '@/lib/telegram/webApp';
import VigilShare from '@/components/vigil/VigilShare';

import { useVigilController } from './useVigilController';
import styles from './vigil.module.css';

const ANGEL_ART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';

/**
 * The Heart & Angel heart already used by the other rituals. Keeping the
 * familiar symbol means the Vigil lights the same heart the visitor meets
 * elsewhere in the Temple.
 */
const HEART_ART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png';

/**
 * Vigil — a single ritual scene.
 *
 * The page keeps one idea and removes everything that used to compete with it:
 * an angel keeps a candle, the visitor offers a spark, and the candle's light
 * crosses the dark room to the shared heart. The server state, cooldown and
 * identity rules are unchanged; only the way the ritual is staged is new.
 */
export default function VigilExperience() {
  const {
    identity,
    reduceMotion,
    angelRef,
    heartRef,
    flameData,
    flameLit,
    flameLabel,
    flameVisuals,
    flameReady,
    flameStatus,
    flameError,
    supporterCount,
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

  // The shared flame clock is published once to the modal header. The same
  // server snapshot also drives the heart and the candle below.
  useRitualModalTimer(flameReady ? flameLabel : null);

  const flameStateLabel = flameReady ? (flameLit ? 'lit' : 'extinguished') : 'unknown';

  const heartGlow = Math.min(1, Math.max(0, flameVisuals.glowOpacity));
  const heartScale = flameLit ? 0.92 + flameVisuals.intensity * 0.2 : 0.86;
  const heartAuraScale = 0.9 + heartGlow * 0.24;
  const flameScale = isLighting ? 1.25 : flameLit ? 0.86 + flameVisuals.intensity * 0.34 : 0.52;
  const sceneStyle = {
    '--heart-glow': heartGlow.toFixed(3),
    '--heart-aura-scale': heartAuraScale.toFixed(3),
    '--flame-scale': flameScale.toFixed(3),
  } as CSSProperties;

  const actionLabel = isLighting
    ? 'Transmitting Spark...'
    : isOnCooldown
      ? `Spark returns in ${cooldownLabel}`
      : !userName
        ? identity.isLoading
          ? 'Preparing your identity…'
          : identity.isTelegram
            ? 'Identity unavailable'
            : 'Sign in to send a spark'
        : 'Send Spark';

  const flameCaption = !flameReady
    ? 'Reading the shared flame'
    : flameLit
      ? 'The heart is lit'
      : 'The heart is waiting';

  const keeperLabel = supporterCount === 1 ? 'keeper' : 'keepers';

  const identityStatus = (() => {
    if (identity.isLoading) {
      return <span className={styles.muted}>Preparing your identity…</span>;
    }

    if (userName) {
      return (
        <span>
          Keeping watch as <strong className={styles.identityName}>{userName}</strong>
        </span>
      );
    }

    if (identity.isTelegram) {
      return (
        <span className={styles.warning}>
          {identity.error || 'Telegram identity is not available. You can still witness the Vigil.'}
          {identity.error && (
            <button
              type="button"
              onClick={() => void identity.refresh()}
              className={styles.inlineButton}
            >
              Retry
            </button>
          )}
        </span>
      );
    }

    return (
      <span>
        <Link href="/login?next=%2Fvigil" className={styles.signInLink}>
          Sign in
        </Link>{' '}
        to offer a spark of your own.
      </span>
    );
  })();

  return (
    <div className={`vigil-page ${styles.page}`} data-vigil-theme="chapel">
      <div className={styles.roomGlow} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <TempleTopBar backTo="temple" />

      <main className={styles.scene}>
        <header className={styles.heading}>
          <p className={styles.eyebrow}>Heart &amp; Angel · Digital Temple</p>
          <h1 className={styles.title}>Vigil</h1>
          <p className={styles.subtitle}>An angel keeps a candle. Your spark becomes the light.</p>
        </header>

        <section
          className={styles.altar}
          style={sceneStyle}
          aria-label="The angel, the candle and the shared heart"
        >
          <div className={styles.arch} aria-hidden="true">
            <span className={styles.archLine} />
            <span className={styles.archHalo} />
          </div>

          <div className={styles.stars} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>

          <div
            ref={angelRef}
            className={styles.angel}
            data-lighting={isLighting ? 'true' : 'false'}
          >
            <span className={styles.angelHalo} aria-hidden="true" />
            <div className={styles.angelFigure}>
              <Image
                src={ANGEL_ART}
                alt="Guardian angel keeping the candle"
                fill
                sizes="(min-width: 1024px) 260px, 180px"
                className={styles.angelImage}
                priority
                unoptimized
              />
            </div>
            <span className={styles.angelShadow} aria-hidden="true" />
          </div>

          <svg
            className={styles.thread}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            data-lit={flameLit ? 'true' : 'false'}
          >
            <defs>
              <linearGradient id="vigil-thread-gradient" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(255, 196, 112, 0.05)" />
                <stop offset="55%" stopColor="rgba(255, 186, 92, 0.55)" />
                <stop offset="100%" stopColor="rgba(255, 138, 60, 0.9)" />
              </linearGradient>
            </defs>
            <path className={styles.threadGlow} d="M 8 92 C 34 66 60 36 100 18" />
            <path className={styles.threadLine} d="M 8 92 C 34 66 60 36 100 18" />
          </svg>

          <button
            type="button"
            onClick={(event) => void triggerRitual(event)}
            disabled={isLighting || !userName || isOnCooldown}
            aria-busy={isLighting}
            aria-label={actionLabel}
            className={styles.candleControl}
            data-state={isLighting ? 'lighting' : isOnCooldown ? 'cooldown' : 'ready'}
          >
            <span className={styles.candleHalo} aria-hidden="true" />

            <span className={styles.candleArt} aria-hidden="true">
              <span className={styles.flameWrap} data-lit={flameLit ? 'true' : 'false'}>
                <span className={styles.flameGlow} />
                <svg className={styles.flameSvg} viewBox="0 0 40 66" focusable="false">
                  <defs>
                    <radialGradient id="vigil-flame-outer" cx="50%" cy="72%" r="62%">
                      <stop offset="0%" stopColor="#fff6d8" />
                      <stop offset="38%" stopColor="#ffd27a" />
                      <stop offset="72%" stopColor="#ff8b2e" />
                      <stop offset="100%" stopColor="rgba(255, 92, 24, 0.12)" />
                    </radialGradient>
                    <radialGradient id="vigil-flame-inner" cx="50%" cy="78%" r="58%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="62%" stopColor="#ffe6a3" />
                      <stop offset="100%" stopColor="rgba(255, 214, 130, 0.1)" />
                    </radialGradient>
                  </defs>
                  <path
                    className={styles.flameOuter}
                    d="M20 2 C31 19 37 28 34 42 C32 55 26 62 20 62 C14 62 8 55 6 42 C3 28 9 19 20 2 Z"
                    fill="url(#vigil-flame-outer)"
                  />
                  <path
                    className={styles.flameInner}
                    d="M20 24 C26 34 29 40 27 48 C26 55 23 58 20 58 C17 58 14 55 13 48 C11 40 14 34 20 24 Z"
                    fill="url(#vigil-flame-inner)"
                  />
                </svg>
              </span>

              <span className={styles.wick} />
              <span className={styles.wax}>
                <span className={styles.waxDrip} />
                <span className={styles.waxHighlight} />
              </span>
              <span className={styles.dish} />
            </span>

            <span className={styles.candleLabel}>{actionLabel}</span>
          </button>

          <div
            ref={heartRef}
            data-testid="vigil-heart"
            className={styles.heart}
            data-vigil-flame-state={flameStateLabel}
            data-vigil-intensity={flameVisuals.intensity.toFixed(4)}
            data-vigil-remaining-ms={Math.floor(flameVisuals.remainingMs)}
            data-supporter-count={supporterCount}
          >
            <span className={styles.heartAura} aria-hidden="true" />
            <span className={styles.heartRing} aria-hidden="true" />
            <span className={styles.heartOrbit} aria-hidden="true" />

            <motion.div
              className={styles.heartBody}
              animate={
                !flameLit || reduceMotion
                  ? { scale: 1, opacity: 1 }
                  : {
                      scale: [1, 1.045, 1],
                      opacity: [0.94, 1, 0.94],
                    }
              }
              transition={
                !flameLit || reduceMotion
                  ? { duration: 0 }
                  : {
                      duration: 2.8,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }
              }
            >
              <Image
                src={HEART_ART}
                alt=""
                fill
                sizes="(min-width: 1024px) 260px, 180px"
                className={styles.heartImage}
                style={
                  flameLit
                    ? {
                        filter: `brightness(${flameVisuals.brightness.toFixed(
                          3
                        )}) saturate(${flameVisuals.saturate.toFixed(
                          3
                        )}) grayscale(${flameVisuals.grayscale.toFixed(
                          3
                        )}) drop-shadow(0 0 ${Math.max(
                          10,
                          Math.round(flameVisuals.glowBlurPx / 2)
                        )}px rgba(255, 140, 60, ${(0.24 + flameVisuals.intensity * 0.46).toFixed(
                          3
                        )}))`,
                        transform: `scale(${heartScale.toFixed(3)})`,
                      }
                    : {
                        transform: `scale(${heartScale.toFixed(3)})`,
                      }
                }
              />
            </motion.div>

            <span className={styles.heartCaption} aria-hidden="true">
              {flameLit ? 'LIT' : 'WAITING'}
            </span>

            <AnimatePresence>
              {spark && (
                <motion.div
                  key="vigil-spark"
                  initial={
                    reduceMotion ? { opacity: 0, scale: 1 } : { x: 0, y: 0, opacity: 0, scale: 0.4 }
                  }
                  animate={
                    reduceMotion
                      ? { opacity: [0, 1, 0], scale: 1 }
                      : {
                          x: [0, (spark.end.x - spark.start.x) * 0.45, spark.end.x - spark.start.x],
                          y: [0, -104, spark.end.y - spark.start.y],
                          opacity: [0, 1, 1, 0],
                          scale: [0.6, 1.9, 1.35, 0.22],
                          rotate: [0, 20, -14, 0],
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
                  className={styles.spark}
                  style={{ left: spark.start.x, top: spark.start.y }}
                >
                  <span className={styles.sparkTrail} />
                  <span className={styles.sparkCore} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        <section className={styles.meta} aria-live="polite" aria-label="Vigil status">
          <div className={styles.metaItem}>
            <span className={styles.metaValue}>{supporterCount}</span>
            <span className={styles.metaLabel}>{keeperLabel} · 24h</span>
          </div>

          <span className={styles.metaDivider} aria-hidden="true" />

          <div className={`${styles.metaItem} ${styles.metaWide}`}>
            <span
              className={`${styles.metaValue} ${styles.metaValueSmall}`}
              data-flame-state={flameStateLabel}
            >
              {flameReady ? flameLabel : 'Reading the flame…'}
            </span>
            <span className={styles.metaLabel}>{flameCaption}</span>
          </div>

          <span className={styles.metaDivider} aria-hidden="true" />

          <div className={styles.metaItem}>
            <span className={styles.metaValue}>{flameReady ? (flameLit ? '●' : '○') : '…'}</span>
            <span className={styles.metaLabel}>{flameLit ? 'Shared flame' : 'Candle kept'}</span>
          </div>
        </section>

        <section className={styles.details} aria-live="polite">
          <p className={styles.identity}>{identityStatus}</p>

          {flameData?.owner_name && (
            <p className={styles.owner}>
              {flameLit ? 'Heart lit by' : 'Last spark from'}{' '}
              <strong>{flameData.owner_name}</strong>
            </p>
          )}

          {(flameStatus === 'stale' || flameStatus === 'error') && (
            <p className={styles.notice} role="status">
              {flameError || 'Shared flame reconnecting'}
            </p>
          )}

          {isOnCooldown && (
            <p className={styles.notice}>Your next spark returns in {cooldownLabel}.</p>
          )}

          {rateLimitMsg && (
            <p className={styles.error} role="status">
              {rateLimitMsg}
            </p>
          )}

          {isOnCooldown && (
            <div className={styles.share}>
              <VigilShare />
            </div>
          )}
        </section>

        <p className={styles.footnote}>
          One candle. One heart. Keep the light alive for another day.
        </p>
      </main>
    </div>
  );
}
