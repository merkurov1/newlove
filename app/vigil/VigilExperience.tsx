'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';

import TempleTopBar from '@/components/TempleTopBar';
import { useRitualModalTimer } from '@/components/temple/useRitualModalTimer';
import useIsTelegram from '@/components/useIsTelegram';
import { useTelegramBottomButton } from '@/components/telegram/useTelegramBottomButton';
import { hapticImpact } from '@/lib/telegram/webApp';
import { TEMPLE_HOME_ASSETS } from '@/lib/temple/homeAssets';
import {
  resolveHeartBreathingPhase,
  type HeartBreathingPhase,
} from '@/lib/temple/breathing';
import { formatVigilLifetimeLabel } from '@/lib/vigil/analytics';
import VigilShare from '@/components/vigil/VigilShare';

import { useVigilController } from './useVigilController';
import styles from './vigil.module.css';

const ANGEL_ART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';

/**
 * Vigil — a single ritual scene.
 *
 * The page keeps one idea and removes everything that used to compete with it:
 * an angel keeps watch, the visitor offers a spark, and its light crosses the
 * dark room to the shared heart. The server state, cooldown and identity rules
 * are unchanged; only the way the ritual is staged is new.
 */
export default function VigilExperience({
  presentation = 'page',
}: {
  /** The intercepted Temple modal draws the heart breathing cycle. */
  presentation?: 'page' | 'modal';
} = {}) {
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
    lifetimeTotal,
    analyticsAvailable,
    isLighting,
    isAuthenticating,
    isOnCooldown,
    cooldownLabel,
    rateLimitMsg,
    successMessage,
    authExpired,
    retrySession,
    spark,
    userName,
    triggerRitual,
  } = useVigilController();

  const isTelegram = useIsTelegram();
  const isModal = presentation === 'modal';
  const [breathPhase, setBreathPhase] =
    useState<HeartBreathingPhase>('Inhale');

  const nativeActionAvailable = useTelegramBottomButton({
    text: isAuthenticating
      ? 'CONNECTING TELEGRAM…'
      : isOnCooldown
        ? `SPARK RETURNS IN ${cooldownLabel}`
        : 'SEND SPARK',
    visible: isTelegram,
    // A guest can use the native action too: it starts the Telegram identity
    // exchange and, when that succeeds, the same tap continues to the claim.
    enabled: !isLighting && !isOnCooldown && !isAuthenticating && !authExpired,
    onClick: () => {
      hapticImpact('vigil');
      void triggerRitual();
    },
  });

  // Telegram owns the primary action only when its native button is actually
  // available *and* the identity can use it. A late SDK, an older client
  // without a native button, another mounted ritual still holding ownership,
  // an unresolved identity or an expired session must not leave the screen
  // without a visible, explained fallback.
  const nativeActionReady =
    nativeActionAvailable && Boolean(userName) && !authExpired;
  const showInSceneAction = !isTelegram || !nativeActionReady;

  // The shared flame clock is published once to the modal header. The same
  // server snapshot also drives the heart below.
  useRitualModalTimer(flameReady ? flameLabel : null);

  const flameStateLabel = flameReady ? (flameLit ? 'lit' : 'extinguished') : 'unknown';

  const heartGlow = Math.min(1, Math.max(0, flameVisuals.glowOpacity));
  const heartScale = flameLit ? 0.92 + flameVisuals.intensity * 0.2 : 0.86;
  const heartAuraScale = 0.9 + heartGlow * 0.24;
  const sceneStyle = {
    '--heart-glow': heartGlow.toFixed(3),
    '--heart-aura-scale': heartAuraScale.toFixed(3),
  } as CSSProperties;

  // Send Spark stays the single primary action for guests and registered
  // visitors. A guest tap starts the existing auth/registration flow instead
  // of being disabled; only an in-flight or unavailable action is disabled.
  const actionLabel = isLighting
    ? 'Sending your spark…'
    : isAuthenticating
      ? identity.isTelegram
        ? 'Connecting Telegram…'
        : 'Opening sign in…'
      : authExpired
        ? identity.isTelegram
          ? 'Reopen the Mini App to send a spark'
          : 'Sign in again to send a spark'
        : isOnCooldown
          ? `Spark returns in ${cooldownLabel}`
          : 'Send Spark';

  useEffect(() => {
    if (!isModal) return;

    let frame = 0;
    const startedAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    const tick = () => {
      const now =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      let elapsed = now - startedAt;

      // Read the running CSS animation directly so the caption cannot drift
      // from the 10s breathing phase it describes.
      const animations =
        typeof heartRef.current?.getAnimations === 'function'
          ? heartRef.current.getAnimations()
          : [];
      const breathing = animations.find((animation) =>
        (animation as CSSAnimation).animationName.includes(
          'temple-heart-breathing'
        )
      );

      if (breathing && typeof breathing.currentTime === 'number') {
        elapsed = breathing.currentTime;
      }

      const next = resolveHeartBreathingPhase(elapsed);

      setBreathPhase((previous) => (previous === next ? previous : next));
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [heartRef, isModal]);

  const flameCaption = !flameReady
    ? 'Reading the shared flame'
    : flameLit
      ? 'The heart is lit'
      : 'The heart is waiting';

  const keeperLabel = supporterCount === 1 ? 'keeper' : 'keepers';
  const lifetimeLabel =
    analyticsAvailable && typeof lifetimeTotal === 'number'
      ? formatVigilLifetimeLabel(lifetimeTotal)
      : '';

  const identityStatus = (() => {
    if (identity.status === 'telegram-init-pending') {
      return (
        <span className={styles.muted}>
          Waiting for Telegram to confirm your name…
        </span>
      );
    }

    if (
      identity.status === 'telegram-verifying' ||
      identity.status === 'detecting'
    ) {
      return <span className={styles.muted}>Preparing your identity…</span>;
    }

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
          {identity.error || 'We could not confirm your Telegram name. You can still keep watch.'}
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

          {/*
           * Telegram owns the primary action only while its native
           * BottomButton is actually available. If the SDK is late, the
           * client lacks BottomButton, or another route still owns it, the
           * in-scene action below is the fallback so the ritual is never dead.
           */}
          {showInSceneAction && (
            <button
              type="button"
              onClick={(event) => void triggerRitual(event)}
              disabled={
                isLighting || isAuthenticating || isOnCooldown || authExpired
              }
              aria-busy={isLighting || isAuthenticating}
              aria-label={actionLabel}
              className={styles.sparkButton}
              data-state={
                isLighting
                  ? 'lighting'
                  : isAuthenticating
                    ? 'authenticating'
                    : isOnCooldown
                      ? 'cooldown'
                      : authExpired
                        ? 'expired'
                        : 'ready'
              }
              data-vigil-action="in-scene"
            >
              {actionLabel}
            </button>
          )}

          <div
            ref={heartRef}
            data-testid="vigil-heart"
            className={`${styles.heart}${isModal ? ` ${styles.heartModal}` : ''}`}
            data-breathing-phase={isModal ? breathPhase : undefined}
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
                isModal || !flameLit || reduceMotion
                  ? { scale: 1, opacity: 1 }
                  : {
                      scale: [1, 1.045, 1],
                      opacity: [0.94, 1, 0.94],
                    }
              }
              transition={
                isModal || !flameLit || reduceMotion
                  ? { duration: 0 }
                  : {
                      duration: 2.8,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }
              }
            >
              <Image
                src={TEMPLE_HOME_ASSETS.heart}
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

            <span
              className={styles.heartCaption}
              data-testid={
                isModal ? 'vigil-heart-breath-label' : 'vigil-heart-state-label'
              }
              aria-hidden="true"
            >
              {isModal ? breathPhase : flameLit ? 'LIT' : 'WAITING'}
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

          {lifetimeLabel ? (
            <div className={styles.metaItem}>
              <span
                className={styles.metaValue}
                data-testid="vigil-lifetime-total"
                data-lifetime-total={String(lifetimeTotal)}
              >
                {lifetimeTotal}
              </span>
              <span className={styles.metaLabel}>sparks · all time</span>
            </div>
          ) : (
            <div className={styles.metaItem}>
              <span className={styles.metaValue}>
                {flameReady ? (flameLit ? '●' : '○') : '…'}
              </span>
              <span className={styles.metaLabel}>
                {flameLit ? 'Shared flame' : 'Candle kept'}
              </span>
            </div>
          )}
        </section>

        <section className={styles.details} aria-live="polite">
          <p
            className={styles.identity}
            data-testid="vigil-identity"
            data-identity-status={identity.status}
            data-identity-source={identity.source ?? 'none'}
          >
            {identityStatus}
          </p>

          {flameData?.owner_name && (
            <p className={styles.owner}>
              {flameLit ? 'Heart lit by' : 'Last spark from'}{' '}
              <strong>{flameData.owner_name}</strong>
            </p>
          )}

          {(flameStatus === 'stale' || flameStatus === 'error') && (
            <p className={styles.notice} role="status">
              {flameError || 'The shared flame is catching up'}
            </p>
          )}

          {successMessage && (
            <p
              className={styles.notice}
              role="status"
              data-testid="vigil-success"
            >
              {successMessage}
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

          {authExpired && (
            <p className={styles.notice}>
              {identity.isTelegram ? (
                <>
                  Your Telegram session needs a refresh.{' '}
                  <button
                    type="button"
                    onClick={() => void retrySession()}
                    className={styles.inlineButton}
                  >
                    Retry
                  </button>
                </>
              ) : (
                <>
                  Your session expired.{' '}
                  <Link
                    href="/login?next=%2Fvigil"
                    className={styles.signInLink}
                  >
                    Sign in again
                  </Link>{' '}
                  to send a spark.{' '}
                  <button
                    type="button"
                    onClick={() => void retrySession()}
                    className={styles.inlineButton}
                  >
                    Retry
                  </button>
                </>
              )}
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
