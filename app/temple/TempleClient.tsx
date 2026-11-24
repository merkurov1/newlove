// app/temple/page.tsx

'use client';

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import SoundToggle from '@/components/SoundToggle';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Flame,
  Radio,
  Compass,
  ShieldCheck,
  Moon,
  Trash2,
  X,
  Users,
  Activity,
  Clock,
  Layers,
  Heart,
  Send
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useIsTelegram from '@/components/useIsTelegram';
import { registerTelegramBackHandler } from '@/lib/telegram/backHandler';
import RitualLink from '@/components/temple/RitualLink';
import TempleTributeModal from '@/components/temple/TempleTributeModal';
import { consumeLeftWithoutTrace } from '@/lib/temple/visitTrace';
import { TEMPLE_RITUAL_LINKS } from '@/lib/temple/ritualMenu';
import { TEMPLE_HOME_ASSETS } from '@/lib/temple/homeAssets';
import { globalFlameRemainingMs } from '@/lib/vigil/flame';
import { vigilHeartVisuals } from '@/lib/vigil/supporters';
import { useVigilSupporters } from '@/hooks/useVigilSupporters';
import { useTempleFeed } from '@/hooks/useTempleFeed';
import { TEMPLE_TRACE_LIMIT } from '@/lib/temple/feed';
import { trackTributeSupportView } from '@/lib/tributes/analytics';
import styles from './temple-home.module.css';

type RitualIcon = React.ComponentType<{ size?: number; className?: string }>;

const RITUAL_META: Record<
  string,
  {
    descriptor: string;
    accent: string;
    soft: string;
    icon: RitualIcon;
  }
> = {
  '/heartandangel/calm': {
    descriptor: 'Stillness · Breathe',
    accent: '#6687a2',
    soft: 'rgba(102, 135, 162, 0.26)',
    icon: Moon,
  },
  '/heartandangel/letitgo': {
    descriptor: 'Release · Ash',
    accent: '#a06f6b',
    soft: 'rgba(160, 111, 107, 0.26)',
    icon: Trash2,
  },
  '/absolution': {
    descriptor: 'Confession · Mercy',
    accent: '#6f8c74',
    soft: 'rgba(111, 140, 116, 0.26)',
    icon: ShieldCheck,
  },
  '/cast': {
    descriptor: 'The question · Fate',
    accent: '#8176a8',
    soft: 'rgba(129, 118, 168, 0.26)',
    icon: Compass,
  },
};

const CHAMBERS = [
  ['Heritage', '/heritage'],
  ['Media Archive', '/media'],
  ['Unframed', '/unframed'],
  ['Flow', '/flow'],
  ['Flow Issues', '/flow-issues'],
  ['Selection', '/selection'],
  ['Journal', '/journal'],
] as const;

const TRACE_TONES: Record<
  string,
  { background: string; label: string }
> = {
  VIGIL: { background: '#b47b2d', label: 'Vigil' },
  VIGIL_SPARK: { background: '#c08a38', label: 'Vigil spark' },
  ASH: { background: '#9c5f5b', label: 'Let It Go' },
  CAST: { background: '#6d6997', label: 'Cast' },
  ABSOLUTION: { background: '#5e8870', label: 'Absolution' },
  TRIBUTE: { background: '#b28b4b', label: 'Tribute' },
  MEDITATION: { background: '#7a6c94', label: 'Calm' },
  SILENCE: { background: '#6f7d8a', label: 'Silence' },
  HEARTANDANGEL: { background: '#8e6d8d', label: 'Heart & Angel' },
  WHISPER: { background: '#857a6d', label: 'Whisper' },
};

const DEFAULT_TRACE_TONE = { background: '#6d6560', label: 'Trace' };
const MOSAIC_CELLS = 24;

interface TemplePost {
  id: string | number;
  type: string;
  label: string;
  author: string;
  time: string;
  content: string;
  audioUrl?: string | null;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  color?: string;
}

function getEventVisuals(eventType: string) {
  switch (eventType?.toUpperCase()) {
    case 'VIGIL':
    case 'VIGIL_SPARK':
      return {
        icon: Flame,
        color: 'text-amber-500',
        label: 'Vigil'
      };

    case 'ASH':
      return {
        icon: Trash2,
        color: 'text-rose-500',
        label: 'Let It Go'
      };

    case 'CAST':
      return {
        icon: Compass,
        color: 'text-indigo-400',
        label: 'Cast'
      };

    case 'ABSOLUTION':
      return {
        icon: ShieldCheck,
        color: 'text-emerald-400',
        label: 'Absolution'
      };

    case 'TRIBUTE':
      return {
        icon: Heart,
        color: 'text-amber-300',
        label: 'Tribute'
      };

    case 'HEARTANDANGEL':
    case 'MEDITATION':
    case 'SILENCE':
      return {
        icon: Moon,
        color: 'text-purple-400',
        label: 'Calm'
      };

    case 'WHISPER':
      return {
        icon: Sparkles,
        color: 'text-amber-300',
        label: 'Whisper'
      };

    case 'MODAL_OPEN':
      return {
        icon: Layers,
        color: 'text-stone-300',
        label: 'Trace'
      };

    default:
      return {
        icon: Radio,
        color: 'text-stone-400',
        label: eventType || 'Log'
      };
  }
}

function formatTime(iso?: string) {
  const d = iso ? new Date(iso) : new Date();

  if (isNaN(d.getTime())) return '';

  const time = d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  if (d.toDateString() === new Date().toDateString()) {
    return time;
  }

  return `${d.toLocaleDateString([], {
    day: 'numeric',
    month: 'short'
  })}, ${time}`;
}

/**
 * The Temple page transition leaves a transformed ancestor around this page.
 * A fixed modal rendered inside it is positioned against that ancestor and can
 * be clipped after the page scrolls on a phone. Portals keep the Sanctuary
 * panels anchored to the real viewport on iPhone, iPad and Telegram WebView.
 */
function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(children, document.body);
}

export default function TempleClient() {
  const pathname = usePathname();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isTracesOpen, setIsTracesOpen] = useState(false);
  const [isChroniclesOpen, setIsChroniclesOpen] = useState(false);
  const [clearedTraces, setClearedTraces] = useState(false);
  const [tgUser, setTgUser] = useState<any>(null);
  const isTelegramApp = useIsTelegram();

  const {
    payload: templeFeed,
    status: feedStatus,
    error: feedError,
    refresh: refreshFeed,
  } = useTempleFeed();

  const [vigilNow, setVigilNow] = useState(() => Date.now());
  const [sanctuaryHour, setSanctuaryHour] = useState(() => new Date().getHours());
  const [leftWithoutTrace, setLeftWithoutTrace] = useState(false);
  const [tributeEntry, setTributeEntry] = useState<{ amount?: number } | null>(
    null
  );

  const {
    supporterCount,
    lastLitAt,
    status: vigilStatus,
    error: vigilError,
  } = useVigilSupporters();

  const posts = useMemo<TemplePost[]>(() => {
    const traces = templeFeed?.data ?? [];

    return traces.map((item, index) => {
      const type = (
        item.canonical_type ||
        item.event_type ||
        'WHISPER'
      ).toUpperCase();

      const visuals = getEventVisuals(type);

      let cleanContent = String(item.message ?? '');
      const cleanAuthor = item.author || 'Anonymous';

      if (type === 'ABSOLUTION' && cleanContent.includes('confessed:')) {
        const splitMsg = cleanContent.split('confessed:');

        if (splitMsg.length > 1) {
          cleanContent = `Confessed:${splitMsg.slice(1).join('confessed:')}`;
        }
      }

      return {
        id: item.id ?? `${item.created_at}-${index}`,
        type,
        label: visuals.label,
        author: cleanAuthor,
        time: formatTime(item.created_at),
        content: cleanContent,
        audioUrl: item.audio_url || null,
        icon: visuals.icon,
        color: visuals.color,
      };
    });
  }, [templeFeed]);

  const visiblePosts = useMemo(
    () => (clearedTraces ? [] : posts),
    [clearedTraces, posts]
  );
  const mosaicSlots = useMemo(() => {
    return Array.from({ length: MOSAIC_CELLS }, (_, index) => {
      return visiblePosts[index] ?? null;
    });
  }, [visiblePosts]);

  const stats = templeFeed?.stats ?? {
    completedRituals: 0,
    namedAuthors: 0,
    vigilSparks: 0,
    byType: {},
    windowDays: 0,
    windowStart: '',
    windowEnd: '',
    excluded: { infrastructure: null, incomplete: null },
    truncated: false,
  };
  const loaded = feedStatus !== 'loading';
  const excludedNote = [
    stats.excluded?.infrastructure !== null &&
    stats.excluded?.infrastructure !== undefined
      ? `${stats.excluded.infrastructure} entry/navigation`
      : null,
    stats.excluded?.incomplete !== null &&
    stats.excluded?.incomplete !== undefined
      ? `${stats.excluded.incomplete} incomplete (modal open/intensity)`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const statsWindowLabel = stats.windowDays
    ? `Last ${stats.windowDays} days · all eligible ritual events`
    : 'Rolling window';

  useEffect(() => {
    if (typeof window !== 'undefined' && isTelegramApp) {
      const tg = (window as any).Telegram?.WebApp;

      try {
        tg?.ready?.();
        tg?.expand?.();
      } catch (e) {}

      const user = tg?.initDataUnsafe?.user;

      if (user) {
        setTgUser(user);
        localStorage.setItem('tg_user', JSON.stringify(user));

        const displayName =
          user.username || user.first_name || 'Pilgrim';

        localStorage.setItem('temple_user', displayName);
      }
    }

    setSanctuaryHour(new Date().getHours());

    const timer = setInterval(() => {
      setSanctuaryHour(new Date().getHours());
    }, 60000);

    return () => clearInterval(timer);
  }, [isTelegramApp]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsInfoOpen(false);
        setIsTracesOpen(false);
        setIsChroniclesOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isInfoOpen && !isTracesOpen && !isChroniclesOpen) return;

    return registerTelegramBackHandler(() => {
      if (isChroniclesOpen) {
        setIsChroniclesOpen(false);
        return true;
      }

      if (isTracesOpen) {
        setIsTracesOpen(false);
        return true;
      }

      if (isInfoOpen) {
        setIsInfoOpen(false);
        return true;
      }

      return false;
    });
  }, [isChroniclesOpen, isInfoOpen, isTracesOpen]);

  useEffect(() => {
    if (!isTracesOpen && !isChroniclesOpen) return;

    // Opening a panel is a user action, not a polling tick. The hook refreshes
    // only when its documented TTL has expired.
    void refreshFeed();
  }, [isChroniclesOpen, isTracesOpen, refreshFeed]);

  useEffect(() => {
    const timer = window.setInterval(() => setVigilNow(Date.now()), 30_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    trackTributeSupportView('temple_home');
  }, []);

  useEffect(() => {
    if (pathname !== '/temple') return;

    if (!consumeLeftWithoutTrace()) return;

    setLeftWithoutTrace(true);

    const timer = window.setTimeout(() => setLeftWithoutTrace(false), 8000);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  const vigilRemaining = globalFlameRemainingMs(lastLitAt, vigilNow);
  const hasVigilState =
    vigilStatus === 'ready' || vigilStatus === 'stale';
  const vigilLabel = !hasVigilState
    ? vigilStatus === 'error'
      ? 'Vigil state unavailable'
      : 'Reading the Vigil…'
    : vigilRemaining > 0
      ? `${Math.floor(vigilRemaining / 3_600_000)}h ${Math.floor((vigilRemaining % 3_600_000) / 60_000)}m`
      : 'Flame extinguished';
  const heartVisuals = vigilHeartVisuals(
    hasVigilState ? supporterCount : 0
  );
  const supporterLabel = hasVigilState
    ? `${supporterCount} ${
        supporterCount === 1 ? 'supporter' : 'supporters'
      }`
    : 'Vigil supporters';
  const vigilStateProblem =
    vigilStatus === 'stale' || vigilStatus === 'error'
      ? vigilError || 'Vigil count reconnecting'
      : null;

  const openTribute = useCallback((amount?: number) => {
    setTributeEntry(typeof amount === 'number' ? { amount } : {});
  }, []);

  const closeTribute = useCallback(() => {
    setTributeEntry(null);
  }, []);

  return (
    <div
      className={`${styles.stage} temple-screen telegram-viewport-min`}
    >
      {/*
       * The supplied stained-glass photographs include a strip of studio wall
       * around the glass. The clip follows the arch of the artwork itself so
       * the figures stay open and unframed instead of reading as photo cards.
       */}
      <svg
        aria-hidden="true"
        focusable="false"
        className={styles.archDefs}
      >
        <defs>
          <clipPath
            id="temple-window-arch-left"
            clipPathUnits="objectBoundingBox"
          >
            {/*
             * Follows the outer edge of the angel glass, not the studio wall
             * around it. The supplied angel sits a few pixels narrower than
             * the demon, so each figure gets its own crop.
             */}
            <path d="M0.5 0.012 L0.47 0.014 L0.381 0.052 L0.318 0.082 L0.285 0.102 L0.217 0.152 L0.167 0.202 L0.131 0.252 L0.104 0.302 L0.093 0.332 L0.077 0.402 L0.075 0.5 L0.075 0.972 L0.925 0.972 L0.925 0.5 L0.923 0.402 L0.907 0.332 L0.896 0.302 L0.869 0.252 L0.833 0.202 L0.783 0.152 L0.715 0.102 L0.682 0.082 L0.619 0.052 L0.53 0.014 Z" />
          </clipPath>
          <clipPath
            id="temple-window-arch-right"
            clipPathUnits="objectBoundingBox"
          >
            <path d="M0.5 0.016 L0.474 0.018 L0.374 0.052 L0.306 0.082 L0.269 0.102 L0.199 0.152 L0.148 0.202 L0.113 0.252 L0.088 0.302 L0.078 0.332 L0.066 0.402 L0.065 0.5 L0.065 0.997 L0.935 0.997 L0.935 0.5 L0.934 0.402 L0.921 0.332 L0.911 0.302 L0.886 0.252 L0.852 0.202 L0.801 0.152 L0.731 0.102 L0.695 0.082 L0.626 0.052 L0.526 0.018 Z" />
          </clipPath>
        </defs>
      </svg>

      <div className={styles.page}>
        <header className={styles.microNav}>
          <RitualLink
            href="/heartandangel/world"
            className={styles.navLink}
            aria-label="World"
          >
            <span className={styles.navLinkGlyph} aria-hidden="true">
              ←
            </span>
            <span>World</span>
          </RitualLink>

          <span className={styles.navMark}>Heart &amp; Angel</span>
        </header>

        {isTelegramApp && tgUser && (
          <div className={styles.identity}>
            <div className={styles.identityBadge}>
              <Send size={12} className="text-emerald-500" aria-hidden="true" />
              <span>@{tgUser.username || tgUser.first_name}</span>
            </div>
          </div>
        )}

        <main>
          <section
            className={styles.hero}
            aria-label="Heart, Angel and Demon"
          >
            <div className={styles.heroCenter}>
              <RitualLink
                href="/vigil"
                aria-label={`Light the Vigil heart. ${supporterLabel} in the last 24 hours. ${vigilLabel}.`}
                className={styles.heartLink}
              >
                <span className={styles.heartStage}>
                  <span className={styles.heartHalo} aria-hidden="true" />
                  <span
                    aria-hidden="true"
                    className={styles.heartGlow}
                    style={{
                      opacity: heartVisuals.glowOpacity,
                      filter: `blur(${heartVisuals.glowBlurPx}px)`,
                      transform: `scale(${heartVisuals.scale})`,
                    }}
                  />

                  <Image
                    data-testid="temple-heart"
                    src={TEMPLE_HOME_ASSETS.heart}
                    alt="Shared Temple heart"
                    width={672}
                    height={672}
                    sizes="(min-width: 860px) 232px, 168px"
                    className={styles.heartImage}
                    style={{
                      filter: `grayscale(${heartVisuals.grayscale}) brightness(${heartVisuals.brightness}) saturate(${heartVisuals.saturate})`,
                      transform: `scale(${heartVisuals.scale})`,
                    }}
                    priority
                  />
                </span>

                <span className={styles.vigilHint}>
                  <span
                    className={styles.vigilCount}
                    data-supporter-count={
                      hasVigilState ? supporterCount : undefined
                    }
                  >
                    {supporterLabel}
                  </span>
                  <span className={styles.vigilDot} aria-hidden="true">
                    ·
                  </span>
                  <span>{vigilLabel}</span>
                </span>

                {vigilStateProblem && (
                  <span
                    className={styles.vigilProblem}
                    role="status"
                    aria-live="polite"
                  >
                    {vigilStateProblem}
                  </span>
                )}

                <span className={styles.heartCta}>Light the heart</span>
              </RitualLink>

              <p className={styles.eyebrow}>The Sanctuary</p>
              <h1 className={styles.title}>
                <span className={styles.srOnly}>The Sanctuary — </span>
                Digital Temple
              </h1>
              <p className={styles.lede}>
                A quiet room for what cannot be said. Light the heart, choose a
                ritual, leave a trace.
              </p>
            </div>

            <figure className={`${styles.figure} ${styles.figureLeft}`}>
              <Image
                data-testid="temple-left-panel"
                src={TEMPLE_HOME_ASSETS.left}
                alt="Stained-glass Angel"
                width={896}
                height={1200}
                sizes="(min-width: 1200px) 344px, (min-width: 861px) 28vw, 46vw"
                className={styles.figureImage}
                priority
              />
              <figcaption className={styles.figureCaption}>
                Angel
              </figcaption>
            </figure>

            <figure className={`${styles.figure} ${styles.figureRight}`}>
              <Image
                data-testid="temple-right-panel"
                src={TEMPLE_HOME_ASSETS.right}
                alt="Stained-glass Demon"
                width={896}
                height={1200}
                sizes="(min-width: 1200px) 344px, (min-width: 861px) 28vw, 46vw"
                className={styles.figureImage}
                priority
              />
              <figcaption className={styles.figureCaption}>
                Demon
              </figcaption>
            </figure>
          </section>

          <div className={styles.flow}>
            <section
              className={`${styles.section} ${styles.ritualsSection}`}
              aria-labelledby="rituals-title"
            >
              <div className={styles.sectionHead}>
                <h2 id="rituals-title" className={styles.sectionEyebrow}>
                  Rituals
                </h2>
                <p className={styles.sectionSubtitle}>
                  Four gestures for what words cannot hold.
                </p>
              </div>

              <div className={styles.ritualGrid}>
                {TEMPLE_RITUAL_LINKS.map((ritual) => {
                  const meta = RITUAL_META[ritual.href] ?? {
                    descriptor: 'Ritual',
                    accent: '#8a7a6a',
                    soft: 'rgba(138, 122, 106, 0.24)',
                    icon: Sparkles,
                  };
                  const Icon = meta.icon;

                  return (
                    <RitualLink
                      key={ritual.href}
                      href={ritual.href}
                      className={styles.ritualCard}
                      aria-label={ritual.label}
                    >
                      <span
                        aria-hidden="true"
                        className={styles.ritualPane}
                        style={{
                          color: meta.accent,
                          background: `linear-gradient(180deg, ${meta.soft} 0%, transparent 72%), linear-gradient(180deg, rgba(255,255,255,.18), transparent 45%)`,
                        }}
                      >
                        <Icon size={15} />
                      </span>

                      <span className={styles.ritualBody}>
                        <span className={styles.ritualTitle}>
                          {ritual.label}
                        </span>
                        <span className={styles.ritualDescriptor}>
                          {meta.descriptor}
                        </span>
                      </span>

                      <span className={styles.ritualArrow} aria-hidden="true">
                        ↗
                      </span>
                    </RitualLink>
                  );
                })}
              </div>
            </section>

            <section
              className={`${styles.section} ${styles.tributeSection}`}
              aria-labelledby="tribute-title"
            >
              <div className={styles.tributeBlock}>
                <button
                  type="button"
                  onClick={() => openTribute()}
                  className={styles.tributeRow}
                  aria-label="Support the Temple — Tribute"
                >
                  <span
                    aria-hidden="true"
                    className={styles.tributePane}
                    style={{
                      color: '#a98046',
                      background:
                        'linear-gradient(180deg, rgba(169,128,70,.3) 0%, transparent 78%), linear-gradient(180deg, rgba(255,255,255,.2), transparent 45%)',
                    }}
                  >
                    <Heart size={16} />
                  </span>

                  <span className={styles.rowBody}>
                    <span id="tribute-title" className={styles.rowTitle}>
                      Tribute
                    </span>
                    <span className={styles.rowDescriptor}>
                      Sustain the Temple
                    </span>
                  </span>

                  <span className={styles.rowArrow} aria-hidden="true">
                    →
                  </span>
                </button>

                <div className={styles.tributeMeta}>
                  <p className={styles.tributeExplainer}>
                    Vigil contributes a spark. Tribute materially sustains the
                    Temple.
                  </p>

                  <div
                    className={styles.amounts}
                    aria-label="Suggested Tribute amounts"
                  >
                    {[5, 20, 100].map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => openTribute(amount)}
                        className={styles.amount}
                        title={`Open Tribute at $${amount}`}
                      >
                        ${amount}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {leftWithoutTrace && (
                <p className={styles.leftWithoutTrace} role="status">
                  Left without a trace
                </p>
              )}
            </section>

            <section
              className={`${styles.section} ${styles.tracesSection}`}
              aria-labelledby="traces-title"
            >
              <div className={styles.tracesHead}>
                <div className={styles.tracesHeading}>
                  <h2 id="traces-title" className={styles.sectionEyebrow}>
                    Traces
                  </h2>
                  <p className={styles.sectionSubtitle}>
                    What remains after the ritual.
                  </p>
                </div>

                <div className={styles.tracesActions}>
                  <button
                    type="button"
                    onClick={() => setIsTracesOpen(true)}
                    className={styles.tracesAction}
                    aria-label="Traces"
                  >
                    View all
                  </button>

                  <button
                    type="button"
                    onClick={() => setClearedTraces((value) => !value)}
                    disabled={!loaded || posts.length === 0}
                    className={styles.tracesAction}
                    aria-describedby="traces-clear-note"
                  >
                    {clearedTraces ? 'Restore view' : 'Clear mine'}
                  </button>
                </div>
              </div>

              <span id="traces-clear-note" className={styles.srOnly}>
                Clear mine hides the trace tiles in this browser view only.
                Archived records are not deleted.
              </span>

              <div className={styles.tracesPanel}>
                <div
                  className={styles.mosaic}
                  role="list"
                  aria-label="Recent Temple traces"
                >
                  {mosaicSlots.map((post, index) => {
                    if (!post) {
                      return (
                        <div
                          key={`empty-${index}`}
                          role="listitem"
                          aria-hidden="true"
                          className={styles.mosaicItem}
                        >
                          <span className={styles.emptyCell} />
                        </div>
                      );
                    }

                    const tone = TRACE_TONES[post.type] ?? DEFAULT_TRACE_TONE;

                    return (
                      <div
                        key={String(post.id)}
                        role="listitem"
                        className={styles.mosaicItem}
                      >
                        <button
                          type="button"
                          onClick={() => setIsTracesOpen(true)}
                          className={styles.traceCell}
                          style={{
                            background: `linear-gradient(135deg, rgba(255,255,255,.22) 0%, transparent 54%), ${tone.background}`,
                          }}
                          aria-label={`${tone.label} trace by ${post.author}, ${post.time}. Open Traces.`}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className={styles.tracesFoot}>
                  <span>
                    {loaded
                      ? stats.windowDays
                        ? `${stats.completedRituals} ritual marks in the last ${stats.windowDays} days`
                        : `${stats.completedRituals} ritual marks in the current window`
                      : 'Reading the ether…'}
                  </span>

                  <span className={styles.tracesCount}>
                    {loaded
                      ? `${posts.length} recent ${
                          posts.length === 1 ? 'trace' : 'traces'
                        }`
                      : ''}
                  </span>

                  <span className={styles.traceNote}>
                    {clearedTraces
                      ? 'Trace tiles are hidden in this view. The archive is unchanged.'
                      : 'Live archive · entry and navigation events excluded.'}
                  </span>
                </div>
              </div>
            </section>

            <section
              className={`${styles.section} ${styles.chambersSection}`}
              aria-labelledby="chambers-title"
            >
              <div className={styles.sectionHead}>
                <h2 id="chambers-title" className={styles.sectionEyebrow}>
                  Chambers
                </h2>
                <p className={styles.sectionSubtitle}>
                  Other rooms in the house.
                </p>
              </div>

              <ol className={styles.chamberGrid}>
                {CHAMBERS.map(([label, href], index) => (
                  <li key={href} className={styles.chamberItem}>
                    <Link
                      href={href}
                      className={styles.chamberLink}
                      aria-label={label}
                    >
                      <span className={styles.chamberNumber}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className={styles.chamberName}>{label}</span>
                      <span className={styles.chamberArrow} aria-hidden="true">
                        ↗
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </main>

        <footer className={styles.footer}>
          <p className={styles.footerMark}>The Sanctuary · Digital Temple</p>

          <div className={styles.footerActions}>
            <button
              type="button"
              onClick={() => setIsInfoOpen(true)}
              className={styles.footerButton}
              aria-label="Open Sanctuary information"
            >
              Info
            </button>

            <button
              type="button"
              onClick={() => setIsChroniclesOpen(true)}
              className={styles.footerButton}
              aria-label="Chronicles"
            >
              Chronicles
            </button>

            <SoundToggle
              className={styles.soundToggle}
              showTextOnMobile
            />
          </div>

          <p className={styles.footerCopy}>Merkurov Love</p>
        </footer>
      </div>

      <ModalPortal>
        <AnimatePresence>
          {isInfoOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsInfoOpen(false)}
            role="presentation"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="temple-info-title"
              className={`${styles.modalPanel} rounded-md p-6 sm:p-8 max-w-md w-full border space-y-4 relative shadow-2xl`}
            >
              <button
                onClick={() => setIsInfoOpen(false)}
                aria-label="Close Sanctuary information"
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-stone-500/20 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>

              <h3
                id="temple-info-title"
                className="font-serif text-2xl font-normal"
              >
                The Sanctuary
              </h3>

              <p className="font-serif text-sm leading-relaxed font-light opacity-90">
                This digital temple is a quiet space of presence. Light and
                dark follow your device. Here, rituals work, and every visitor
                leaves a trace.
              </p>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>
      </ModalPortal>

      <ModalPortal>
        <AnimatePresence>
          {isTracesOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsTracesOpen(false)}
            role="presentation"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="temple-traces-title"
              className={`${styles.modalPanel} rounded-md p-6 sm:p-8 max-w-2xl w-full border space-y-4 relative shadow-2xl max-h-[80vh] flex flex-col`}
            >
              <div className="flex items-center justify-between border-b pb-3 border-stone-500/20">
                <div>
                  <h3
                    id="temple-traces-title"
                    className="font-serif text-xl sm:text-2xl font-normal"
                  >
                    Sanctuary Traces
                  </h3>

                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mt-0.5">
                    Up to {TEMPLE_TRACE_LIMIT} most recent ritual traces ·
                    entry, navigation and incomplete events excluded
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshFeed({ force: true })}
                    className="min-h-[32px] rounded-full bg-stone-500/10 px-3 font-mono text-[9px] uppercase tracking-widest opacity-70 transition-opacity hover:opacity-100"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => setIsTracesOpen(false)}
                    aria-label="Close Sanctuary Traces"
                    className="w-8 h-8 rounded-full bg-stone-500/20 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {feedError && (
                <p
                  role="status"
                  className="font-mono text-[10px] leading-relaxed opacity-60"
                >
                  {feedStatus === 'stale'
                    ? 'Showing the last known good snapshot. '
                    : ''}
                  {feedError}
                </p>
              )}

              <div className="divide-y divide-stone-500/10 overflow-y-auto pr-1 flex-1">
                {!loaded ? (
                  <p className="font-mono text-xs opacity-60 uppercase tracking-widest animate-pulse py-8 text-center">
                    Reading the ether...
                  </p>
                ) : posts.length === 0 ? (
                  <p className="font-mono text-xs opacity-60 uppercase tracking-widest py-8 text-center">
                    No eligible ritual traces yet.
                  </p>
                ) : (
                  posts.map(post => {
                    const IconComponent = post.icon || Radio;

                    return (
                      <div
                        key={post.id}
                        className="py-3 flex items-center justify-between gap-3 text-xs sm:text-sm"
                      >
                        <div className="flex items-center gap-2.5 shrink-0">
                          <div
                            className={`w-7 h-7 rounded-full bg-stone-500/10 flex items-center justify-center ${
                              post.color || 'text-stone-400'
                            }`}
                          >
                            <IconComponent size={15} />
                          </div>

                          <span className="font-mono text-xs font-bold uppercase tracking-wider">
                            {post.label}
                          </span>
                        </div>

                        <div className="flex-1 font-serif text-xs sm:text-sm font-light opacity-85 truncate px-2 flex items-center gap-2 text-left">
                          <span className="font-medium opacity-75 shrink-0 text-xs">
                            {post.author}
                          </span>

                          <span className="opacity-40">•</span>

                          <span className="truncate">
                            {post.content}
                          </span>
                        </div>

                        <div className="font-mono text-[10px] opacity-50 shrink-0 text-right">
                          {post.time}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>
      </ModalPortal>

      <ModalPortal>
        <AnimatePresence>
          {isChroniclesOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsChroniclesOpen(false)}
            role="presentation"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="temple-chronicles-title"
              className={`${styles.modalPanel} rounded-md p-6 sm:p-8 max-w-md w-full border space-y-6 relative shadow-2xl`}
            >
              <div className="flex items-center justify-between border-b pb-4 border-stone-500/20">
                <div>
                  <h3
                    id="temple-chronicles-title"
                    className="font-serif text-2xl font-normal"
                  >
                    Chronicles
                  </h3>

                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mt-0.5">
                    {statsWindowLabel} · cached for {templeFeed?.meta.ttlSeconds ?? 60}s
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshFeed({ force: true })}
                    className="min-h-[32px] rounded-full bg-stone-500/10 px-3 font-mono text-[9px] uppercase tracking-widest opacity-70 transition-opacity hover:opacity-100"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => setIsChroniclesOpen(false)}
                    aria-label="Close Chronicles"
                    className="w-8 h-8 rounded-full bg-stone-500/20 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {feedError && (
                <p
                  role="status"
                  className="font-mono text-[10px] leading-relaxed opacity-60"
                >
                  {feedStatus === 'stale'
                    ? 'Showing the last known good snapshot. '
                    : ''}
                  {feedError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-6 py-2">
                <div className="flex flex-col items-center justify-center text-center space-y-1">
                  <Users size={20} className="opacity-60 mb-1" />

                  <span className="font-mono text-3xl sm:text-4xl font-light tracking-tight">
                    {stats.namedAuthors}
                  </span>

                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">
                    Named Authors
                  </span>

                  <span className="text-[10px] font-serif opacity-50">
                    Distinct display names in the window — not verified unique
                    people
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center text-center space-y-1">
                  <Activity size={20} className="opacity-60 mb-1" />

                  <span className="font-mono text-3xl sm:text-4xl font-light tracking-tight">
                    {stats.completedRituals}
                  </span>

                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">
                    Completed Rituals
                  </span>

                  <span className="text-[10px] font-serif opacity-50">
                    Eligible ritual events in the full window
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center text-center space-y-1">
                  <Flame size={20} className="text-amber-500 mb-1" />

                  <span className="font-mono text-3xl sm:text-4xl font-light tracking-tight">
                    {stats.vigilSparks}
                  </span>

                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">
                    Vigil Sparks
                  </span>

                  <span className="text-[10px] font-serif opacity-50">
                    VIGIL and VIGIL_SPARK events in the same window
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center text-center space-y-1">
                  <Clock size={20} className="text-indigo-400 mb-1" />

                  <span className="font-mono text-3xl sm:text-4xl font-light tracking-tight">
                    {sanctuaryHour}:00
                  </span>

                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">
                    Sanctuary Hour
                  </span>

                  <span className="text-[10px] font-serif opacity-50">
                    Current device time (local, not a dataset metric)
                  </span>
                </div>
              </div>

              {(excludedNote || stats.truncated) && (
                <p className="border-t border-stone-500/20 pt-3 font-mono text-[9px] leading-relaxed opacity-50">
                  {excludedNote
                    ? `Excluded from ritual counts: ${excludedNote}.`
                    : ''}
                  {excludedNote && stats.truncated ? ' ' : ''}
                  {stats.truncated
                    ? 'Aggregate row limit reached; some window counts may be incomplete.'
                    : ''}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>
      </ModalPortal>

      {tributeEntry && (
        <TempleTributeModal
          initialAmount={tributeEntry.amount}
          onClose={closeTribute}
        />
      )}
    </div>
  );
}
