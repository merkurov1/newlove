// app/temple/page.tsx

'use client';

import React, {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
} from 'react';
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
  Heart,
  Send,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useIsTelegram from '@/components/useIsTelegram';
import { registerTelegramBackHandler } from '@/lib/telegram/backHandler';
import { hapticImpact, hapticSelection } from '@/lib/telegram/webApp';
import { useTelegramBottomButton } from '@/components/telegram/useTelegramBottomButton';
import AddToHomePrompt from '@/components/temple/AddToHomePrompt';
import SharedVigil from '@/components/temple/SharedVigil';
import RitualLink from '@/components/temple/RitualLink';
import { consumeLeftWithoutTrace } from '@/lib/temple/visitTrace';
import { TEMPLE_RITUAL_LINKS } from '@/lib/temple/ritualMenu';
import { TEMPLE_HOME_ASSETS } from '@/lib/temple/homeAssets';
import { resolveVigilFlame } from '@/lib/vigil/flame';
import { useVigilSupporters } from '@/hooks/useVigilSupporters';
import useTempleIdentity from '@/hooks/useTempleIdentity';
import { useTempleFeed } from '@/hooks/useTempleFeed';
import { supabase } from '@/lib/supabase-browser';
import {
  TEMPLE_TRACE_LIMIT,
  type TempleFeedPayload,
} from '@/lib/temple/feed';
import {
  trackTributeCheckoutCreated,
  trackTributeSupportView,
} from '@/lib/tributes/analytics';
import {
  createTributeCheckout,
  openSecureCheckout,
} from '@/lib/tributes/checkoutClient';
import styles from './temple.module.css';

type RitualIcon = React.ComponentType<{ size?: number; className?: string }>;

const RITUAL_META: Record<
  string,
  {
    descriptor: string;
    accent: string;
    icon: RitualIcon;
  }
> = {
  '/heartandangel/calm': {
    descriptor: 'Stillness · Breathe',
    accent: '#5d7f9b',
    icon: Moon,
  },
  '/heartandangel/letitgo': {
    descriptor: 'Release · Ash',
    accent: '#9b6761',
    icon: Trash2,
  },
  '/absolution': {
    descriptor: 'Confession · Mercy',
    accent: '#67836b',
    icon: ShieldCheck,
  },
  '/cast': {
    descriptor: 'The question · Fate',
    accent: '#796fa0',
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

interface TemplePost {
  id: string | number;
  type: string;
  label: string;
  author: string;
  time: string;
  createdAt: string;
  content: string;
  audioUrl?: string | null;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  accent?: string;
}

function getEventVisuals(eventType: string) {
  switch (eventType?.toUpperCase()) {
    case 'VIGIL':
    case 'VIGIL_SPARK':
      return {
        icon: Flame,
        accent: '#b77c1f',
        label: 'Vigil',
      };

    case 'ASH':
      return {
        icon: Trash2,
        accent: '#a24c55',
        label: 'Let It Go',
      };

    case 'CAST':
      return {
        icon: Compass,
        accent: '#5f699f',
        label: 'Cast',
      };

    case 'ABSOLUTION':
      return {
        icon: ShieldCheck,
        accent: '#4f7a58',
        label: 'Absolution',
      };

    case 'TRIBUTE':
      return {
        icon: Heart,
        accent: '#a9752c',
        label: 'Tribute',
      };

    case 'HEARTANDANGEL':
    case 'MEDITATION':
    case 'SILENCE':
      return {
        icon: Moon,
        accent: '#7d62a1',
        label: 'Calm',
      };

    case 'WHISPER':
      return {
        icon: Sparkles,
        accent: '#9a7437',
        label: 'Whisper',
      };

    default:
      return {
        icon: Radio,
        accent: '#85786b',
        label: eventType || 'Log',
      };
  }
}

/**
 * A short, human explanation of what the stored ritual event represents. The
 * canonical type comes from the server classifier; this map only supplies the
 * display wording, so unknown future rituals still read as completed rituals
 * rather than being mislabelled as navigation.
 */
const TEMPLE_TRACE_ACTIONS: Record<string, string> = {
  VIGIL: 'Lit the Vigil heart',
  VIGIL_SPARK: 'Sent a Vigil spark',
  ASH: 'Released a burden',
  CAST: 'Cast an archetype',
  ABSOLUTION: 'Received absolution',
  TRIBUTE: 'Offered a Tribute',
  MEDITATION: 'Found calm',
  SILENCE: 'Kept silence',
  HEARTANDANGEL: 'Held the heart',
  WHISPER: 'Left a whisper',
};

function getTraceAction(type: string) {
  return TEMPLE_TRACE_ACTIONS[type.toUpperCase()] ?? 'Completed a ritual';
}

function formatTime(iso?: string) {
  if (!iso) return '';

  const d = new Date(iso);

  if (isNaN(d.getTime())) return '';

  // Stable UTC output keeps the server-rendered HTML identical to the first
  // client render (no timezone/locale hydration difference) and matches the
  // UTC boundaries documented for the Chronicles window.
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(d);

  return `${date}, ${time} UTC`;
}

/**
 * The Temple page transition leaves a transformed ancestor around this page.
 * A fixed dialog rendered inside it is positioned against that ancestor and
 * can be clipped after the page scrolls on a phone. Portals keep the
 * non-payment information dialogs anchored to the real viewport on iPhone,
 * iPad and Telegram WebView.
 */
function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(children, document.body);
}

export default function TempleClient({
  initialFeed = null,
}: {
  /** Server-read feed so the seven traces are present in the first HTML. */
  initialFeed?: TempleFeedPayload | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isChroniclesOpen, setIsChroniclesOpen] = useState(false);
  const [tgUser, setTgUser] = useState<any>(null);
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const isTelegramApp = useIsTelegram();

  const {
    payload: templeFeed,
    status: feedStatus,
    error: feedError,
    refresh: refreshFeed,
  } = useTempleFeed(initialFeed);

  const [vigilNow, setVigilNow] = useState(() => Date.now());
  const [sanctuaryHour, setSanctuaryHour] = useState(() => new Date().getHours());
  const [leftWithoutTrace, setLeftWithoutTrace] = useState(false);

  const {
    supporterCount,
    lastLitAt,
    flameExpiresAt,
    flameLit: serverFlameLit,
    status: vigilStatus,
    error: vigilError,
    refresh: refreshSupporters,
  } = useVigilSupporters();

  const identity = useTempleIdentity();
  const isAuthenticated =
    identity.status === 'verified' && Boolean(identity.displayName);
  const [sparkStatus, setSparkStatus] = useState<
    'idle' | 'holding' | 'sending' | 'sent' | 'cooldown' | 'error'
  >('idle');
  const [sparkMessage, setSparkMessage] = useState('');
  const holdTimerRef = useRef<number | null>(null);
  const lastHoldAtRef = useRef(0);
  const sendingRef = useRef(false);

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
      let cleanAuthor = item.author || 'Anonymous';

      // Defense in depth for any cached or legacy payload that bypassed the
      // server redaction: Absolution never exposes confession text, the
      // selected burden or the pilgrim's identity in the public feed.
      if (type === 'ABSOLUTION') {
        cleanContent = 'Completed the Absolution ritual.';
        cleanAuthor = 'Anonymous';
      }

      return {
        id: item.id ?? `${item.created_at}-${index}`,
        type,
        label: visuals.label,
        author: cleanAuthor,
        time: formatTime(item.created_at),
        createdAt: item.created_at,
        content: cleanContent,
        audioUrl: item.audio_url || null,
        icon: visuals.icon,
        accent: visuals.accent,
      };
    });
  }, [templeFeed]);

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
        setIsChroniclesOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isInfoOpen && !isChroniclesOpen) return;

    return registerTelegramBackHandler(() => {
      if (isChroniclesOpen) {
        setIsChroniclesOpen(false);
        return true;
      }

      if (isInfoOpen) {
        setIsInfoOpen(false);
        return true;
      }

      return false;
    });
  }, [isChroniclesOpen, isInfoOpen]);

  useEffect(() => {
    if (!isChroniclesOpen) return;

    // Opening the panel is a user action, not a polling tick. The hook
    // refreshes only when its documented TTL has expired.
    void refreshFeed();
  }, [isChroniclesOpen, refreshFeed]);

  useEffect(() => {
    const tick = () => setVigilNow(Date.now());
    const timer = window.setInterval(tick, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
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

  const hasVigilState =
    vigilStatus === 'ready' || vigilStatus === 'stale';
  // One authoritative snapshot + one shared calculation. Client time only
  // interpolates between the server timestamps, so the heart fades to exactly
  // zero at the shared expiry even if a refresh is briefly delayed.
  const heartVisuals = useMemo(
    () =>
      resolveVigilFlame(
        {
          flameLit: hasVigilState ? serverFlameLit : false,
          lastLitAt,
          flameExpiresAt,
          supporterCount: hasVigilState ? supporterCount : 0,
        },
        vigilNow
      ),
    [
      flameExpiresAt,
      hasVigilState,
      lastLitAt,
      serverFlameLit,
      supporterCount,
      vigilNow,
    ]
  );
  const flameActive = hasVigilState && heartVisuals.active;
  const vigilRemaining = heartVisuals.remainingMs;
  const vigilLabel = !hasVigilState
    ? vigilStatus === 'error'
      ? 'Vigil state unavailable'
      : 'Reading the Vigil…'
    : flameActive
      ? `${Math.floor(vigilRemaining / 3_600_000)}h ${Math.floor((vigilRemaining % 3_600_000) / 60_000)}m`
      : 'Flame extinguished';
  const supporterLabel = hasVigilState
    ? `${supporterCount} ${
        supporterCount === 1 ? 'supporter' : 'supporters'
      }`
    : 'Vigil supporters';
  const vigilStateProblem =
    vigilStatus === 'stale' || vigilStatus === 'error'
      ? vigilError || 'Vigil count reconnecting'
      : null;

  const heartInstruction = isAuthenticated
    ? 'Hold to send a spark · Tap to enter the Vigil'
    : 'Tap or hold the heart · Enter the Vigil';

  /**
   * A clicked amount is a complete instruction. It starts the existing secure
   * Stripe Checkout session for that exact amount immediately; the visitor
   * still confirms the payment on Stripe's hosted page. Nothing is charged
   * from this page, and the server validates the amount again.
   */
  const startAmountCheckout = useCallback(
    async (amount: number) => {
      if (pendingAmount !== null) return;

      setPendingAmount(amount);
      setPaymentError(null);

      try {
        const donorName =
          typeof window !== 'undefined'
            ? localStorage.getItem('temple_user') || 'Pilgrim'
            : 'Pilgrim';

        const { url } = await createTributeCheckout({
          amount,
          donorName,
          message: 'Fuel for the Temple',
          search:
            typeof window !== 'undefined'
              ? window.location.search
              : null,
        });

        trackTributeCheckoutCreated(amount);
        openSecureCheckout(url);

        // Keep the button in its pending state while the browser or Telegram
        // WebView leaves for Stripe. A slow hand-off can be retried after the
        // timeout without risking a second automatic charge.
        window.setTimeout(() => setPendingAmount(null), 20_000);
      } catch (error) {
        console.error('Temple tribute checkout error:', error);
        setPendingAmount(null);
        setPaymentError(
          error instanceof Error
            ? error.message
            : 'The secure checkout could not be opened. Please try again.'
        );
      }
    },
    [pendingAmount]
  );

  const clearHeartHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    setSparkStatus((current) => (current === 'holding' ? 'idle' : current));
    setSparkMessage((current) =>
      current === 'Keep holding to send your spark…' ? '' : current
    );
  }, []);

  const sendHeartSpark = useCallback(async () => {
    if (!isAuthenticated || sendingRef.current) return;

    sendingRef.current = true;
    setSparkStatus('sending');
    setSparkMessage('Sending your spark…');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch('/api/vigil/claim', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ id: 1 }),
      });

      const payload = await response.json().catch(() => null);

      if (response.status === 429) {
        const message =
          typeof payload?.message === 'string' && payload.message
            ? payload.message
            : 'Your next spark is not available yet.';

        setSparkStatus('cooldown');
        setSparkMessage(message);
        return;
      }

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : `The spark could not be sent (${response.status}).`
        );
      }

      // Only a confirmed server response may change the success state or
      // trigger the refreshed statistics/flame.
      setSparkStatus('sent');
      setSparkMessage('Spark received · the shared heart is lit');

      await Promise.allSettled([
        refreshSupporters(),
        refreshFeed({ force: true }),
      ]);
    } catch (error) {
      console.error(
        'Temple heart spark error:',
        error instanceof Error ? error.message : error
      );
      setSparkStatus('error');
      setSparkMessage('The spark could not be sent. Please try again.');
    } finally {
      sendingRef.current = false;
    }
  }, [isAuthenticated, refreshFeed, refreshSupporters]);

  const startHeartHold = useCallback(() => {
    if (!isAuthenticated || sendingRef.current) return;

    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
    }

    setSparkStatus('holding');
    setSparkMessage('Keep holding to send your spark…');

    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      lastHoldAtRef.current = Date.now();
      void sendHeartSpark();
    }, 650);
  }, [isAuthenticated, sendHeartSpark]);

  const handleHeartClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (Date.now() - lastHoldAtRef.current < 1200) {
        event.preventDefault();
        lastHoldAtRef.current = 0;
      }
    },
    []
  );

  const handleHeartKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLAnchorElement>) => {
      if (!isAuthenticated) return;
      if (event.key !== ' ' && event.key !== 'Enter') return;

      event.preventDefault();

      if (!event.repeat) startHeartHold();
    },
    [isAuthenticated, startHeartHold]
  );

  const handleHeartKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLAnchorElement>) => {
      if (!isAuthenticated) return;
      if (event.key !== ' ' && event.key !== 'Enter') return;

      event.preventDefault();
      const didHold = Date.now() - lastHoldAtRef.current < 1200;

      clearHeartHold();

      // A short Enter remains a normal navigation to the Vigil; a hold has
      // already sent the spark. Space is only a hold gesture.
      if (!didHold && event.key === 'Enter') {
        router.push('/vigil');
      }
    },
    [clearHeartHold, isAuthenticated, router]
  );

  useEffect(() => {
    return () => {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
  }, []);

  // In Telegram, the native BottomButton is the single primary Temple action.
  // It is hidden while an in-page modal/payment surface owns the screen so it
  // never competes with the modal's own actions.
  const modalOpen = isInfoOpen || isChroniclesOpen;

  useTelegramBottomButton({
    text: 'KEEP THE VIGIL',
    visible: isTelegramApp && !modalOpen,
    enabled: hasVigilState,
    onClick: () => {
      hapticImpact('vigil');
      router.push('/vigil');
    },
  });

  return (
    <div
      className={`${styles.stage} temple-screen telegram-viewport-min`}
      data-temple-theme="light"
    >
      {/*
       * The supplied stained-glass photographs include a strip of studio wall
       * around the glass. The clip follows the arch of the artwork itself so
       * the figures stay open and unframed and the blue backlight remains
       * visible behind them. The source files are never modified.
       */}
      <svg aria-hidden="true" focusable="false" className={styles.archDefs}>
        <defs>
          <clipPath
            id="temple-window-arch-left"
            clipPathUnits="objectBoundingBox"
          >
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

      <div className={styles.layout}>
        <aside
          className={`${styles.rail} ${styles.railLeft}`}
          data-testid="temple-left-rail"
          aria-label="Stained-glass Angel"
        >
          <figure className={`${styles.panel} ${styles.panelLeft}`}>
            <Image
              data-testid="temple-left-panel"
              src={TEMPLE_HOME_ASSETS.left}
              alt="Stained-glass Angel"
              width={896}
              height={1200}
              sizes="(min-width: 1024px) 16rem, 32vw"
              className={styles.panelImage}
              priority
            />
            <figcaption className={styles.panelCaption}>Angel</figcaption>
          </figure>
        </aside>

        <div
          className={styles.center}
          data-testid="temple-center-scroll"
        >
          <header className={styles.topbar}>
            {!isTelegramApp ? (
              <Link
                href="/heartandangel/world"
                className={styles.navLink}
                aria-label="Back to World"
              >
                <span aria-hidden="true">←</span>
                <span>World</span>
              </Link>
            ) : (
              <span />
            )}

            {isTelegramApp && tgUser ? (
              <div className={styles.identityBadge}>
                <Send size={12} className="text-emerald-500" aria-hidden="true" />
                <span>@{tgUser.username || tgUser.first_name}</span>
              </div>
            ) : (
              <span className={styles.navMark}>Heart &amp; Angel</span>
            )}

            {!isTelegramApp && (
              <SoundToggle className={styles.ghostButton} />
            )}
          </header>

          <main className={styles.main}>
            <section className={styles.hero} aria-label="The living heart">
              <RitualLink
                href="/vigil"
                onClick={(event) => {
                  handleHeartClick(event);
                  hapticImpact('vigil');
                }}
                onPointerDown={(event) => {
                  if (typeof event.button === 'number' && event.button !== 0) {
                    return;
                  }
                  lastHoldAtRef.current = 0;
                  startHeartHold();
                }}
                onPointerUp={clearHeartHold}
                onPointerLeave={clearHeartHold}
                onPointerCancel={clearHeartHold}
                onKeyDown={handleHeartKeyDown}
                onKeyUp={handleHeartKeyUp}
                onContextMenu={(event) => {
                  if (isAuthenticated) event.preventDefault();
                }}
                aria-label={`Light the Vigil heart. ${supporterLabel} in the last 24 hours. ${vigilLabel}. ${heartInstruction}.`}
                data-heart-auth={isAuthenticated ? 'authenticated' : 'anonymous'}
                data-spark-status={sparkStatus}
                className={styles.heartLink}
                style={{ '--c': '#c8202b' } as React.CSSProperties}
              >
                <span className={styles.heartStage}>
                  <span
                    aria-hidden="true"
                    className={styles.heartRedGlow}
                    data-testid="temple-heart-glow"
                    style={{
                      opacity: flameActive
                        ? Math.min(
                            0.95,
                            0.2 + heartVisuals.glowOpacity * 0.75
                          )
                        : 0,
                      filter:
                        flameActive && heartVisuals.glowBlurPx > 0
                          ? `blur(${heartVisuals.glowBlurPx}px)`
                          : undefined,
                    }}
                  />
                  <span
                    className={styles.heartPulse}
                    data-testid="temple-heart-pulse"
                    data-vigil-flame-state={
                      hasVigilState
                        ? flameActive
                          ? 'lit'
                          : 'extinguished'
                        : 'unknown'
                    }
                    data-vigil-intensity={heartVisuals.intensity.toFixed(4)}
                    data-vigil-remaining-ms={Math.floor(
                      heartVisuals.remainingMs
                    )}
                  >
                    <Image
                      data-testid="temple-heart"
                      src={TEMPLE_HOME_ASSETS.heart}
                      alt="Shared Temple heart"
                      width={672}
                      height={672}
                      sizes="(min-width: 1024px) 13.5rem, 40vw"
                      className={styles.heartImage}
                      style={{
                        filter: `brightness(${heartVisuals.brightness.toFixed(
                          3
                        )}) saturate(${heartVisuals.saturate.toFixed(
                          3
                        )}) grayscale(${heartVisuals.grayscale.toFixed(3)})`,
                        transform: `scale(${heartVisuals.scale.toFixed(3)})`,
                      }}
                      priority
                    />
                  </span>
                </span>

                <span className={styles.vigilCaption}>
                  VIGIL · TAP THE HEART TO KEEP WATCH
                </span>

                <span className={styles.vigilMeta}>
                  <span
                    className={styles.vigilCount}
                    data-supporter-count={
                      hasVigilState ? supporterCount : undefined
                    }
                  >
                    {supporterLabel}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{vigilLabel}</span>
                </span>

                <span
                  id="temple-heart-instruction"
                  className={styles.vigilEntry}
                  aria-hidden="true"
                >
                  {heartInstruction}
                  <span className={styles.vigilEntryArrow}>→</span>
                </span>

                {sparkMessage && (
                  <span
                    data-testid="temple-heart-spark-status"
                    className={styles.vigilProblem}
                    role="status"
                    aria-live="polite"
                  >
                    {sparkMessage}
                  </span>
                )}

                {vigilStateProblem && (
                  <span
                    className={styles.vigilProblem}
                    role="status"
                    aria-live="polite"
                  >
                    {vigilStateProblem}
                  </span>
                )}
              </RitualLink>

              <p className={styles.eyebrow}>THE SANCTUARY</p>
              <h1 className={styles.title}>Digital Temple</h1>
              <p className={styles.lede}>
                A place to be present, to do something small, and to leave a
                mark.
              </p>
            </section>

            <section
              className={`${styles.section} ${styles.ritualsSection}`}
              aria-labelledby="rituals-title"
            >
              <div className={styles.sectionHeading}>
                <h2 id="rituals-title" className={styles.sectionTitle}>
                  Rituals
                </h2>
                <p className={styles.sectionNote}>
                  Four gestures for what words cannot hold
                </p>
              </div>

              <div className={styles.ritualGrid}>
                {TEMPLE_RITUAL_LINKS.map((ritual) => {
                  const meta = RITUAL_META[ritual.href] ?? {
                    descriptor: 'Ritual',
                    accent: '#9a7437',
                    icon: Sparkles,
                  };
                  const Icon = meta.icon;

                  return (
                    <RitualLink
                      key={ritual.href}
                      href={ritual.href}
                      onClick={() => hapticImpact('ritual-select')}
                      className={styles.ritualCard}
                      aria-label={ritual.label}
                      style={
                        {
                          '--accent': meta.accent,
                          '--c': meta.accent,
                        } as React.CSSProperties
                      }
                    >
                      <span className={styles.ritualIcon} aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <span className={styles.ritualBody}>
                        <span className={styles.ritualLabel}>
                          {ritual.label}
                        </span>
                        <span className={styles.ritualHint}>
                          {meta.descriptor}
                        </span>
                      </span>
                    </RitualLink>
                  );
                })}
              </div>
            </section>

            <section
              className={`${styles.section} ${styles.supportSection}`}
              aria-labelledby="support-title"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <h2 id="support-title" className={styles.sectionTitle}>
                    Tribute
                  </h2>
                  <p className={styles.sectionNote}>
                    Direct support · secure Stripe checkout
                  </p>
                </div>
                <Heart
                  size={15}
                  className={styles.sectionMark}
                  aria-hidden="true"
                />
              </div>

              <div className={styles.supportCard}>
                <p className={styles.supportCopy}>
                  Vigil contributes a spark. Tribute materially sustains the
                  Temple.
                </p>

                <Link
                  href="/temple/support"
                  onClick={() => hapticSelection()}
                  className={styles.supportPrimary}
                  data-testid="support-temple-generic"
                >
                  Support the Temple →
                </Link>

                <div
                  className={styles.amountRow}
                  aria-label="Support the Temple with a specific amount"
                >
                  {[5, 20, 100].map(amount => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => {
                        hapticSelection();
                        void startAmountCheckout(amount);
                      }}
                      disabled={pendingAmount !== null}
                      className={styles.amountButton}
                      title={`Continue to secure Stripe checkout for $${amount}`}
                    >
                      {pendingAmount === amount ? 'Opening…' : `$${amount}`}
                    </button>
                  ))}
                </div>

                {paymentError && (
                  <p className={styles.supportError} role="alert">
                    {paymentError}
                  </p>
                )}

                <p className={styles.supportStatus} aria-live="polite">
                  {pendingAmount !== null
                    ? 'Opening the secure Stripe checkout…'
                    : 'Amounts open Stripe directly. You confirm the payment there.'}
                </p>
              </div>

              {leftWithoutTrace && (
                <p className={styles.leftWithoutTrace} role="status">
                  Left without a trace
                </p>
              )}
            </section>

            {isTelegramApp && (
              <section
                className={`${styles.section} ${styles.communitySection}`}
                aria-labelledby="shared-vigil-title"
                data-testid="shared-vigil-group"
              >
                <div className={styles.communityCard}>
                  <div className={styles.groupHeading}>
                    <span className={styles.groupIcon} aria-hidden="true">
                      <Users size={15} />
                    </span>
                    <div>
                      <h2
                        id="shared-vigil-title"
                        className={styles.groupTitle}
                      >
                        Shared Vigil
                      </h2>
                      <p className={styles.groupNote}>
                        A small circle of keepers in your group chat.
                      </p>
                    </div>
                  </div>
                  <SharedVigil />
                </div>
              </section>
            )}

            <AddToHomePrompt className={styles.homeHintSection} />

            <section
              className={`${styles.section} ${styles.tracesSection}`}
              aria-labelledby="traces-title"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <h2 id="traces-title" className={styles.sectionTitle}>
                    Traces
                  </h2>
                  <p className={styles.sectionNote}>
                    Latest {TEMPLE_TRACE_LIMIT} completed rituals · newest first
                  </p>
                </div>

                <div className={styles.tracesActions}>
                  <button
                    type="button"
                    onClick={() => void refreshFeed({ force: true })}
                    className={styles.ghostButton}
                    aria-label="Refresh the latest Temple traces"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsChroniclesOpen(true)}
                    className={`${styles.ghostButton} ${styles.chroniclesLink}`}
                    aria-label="Open full Chronicles"
                    data-testid="traces-chronicles"
                  >
                    <Activity size={12} aria-hidden="true" />
                    Chronicles
                    <span className={styles.chroniclesArrow} aria-hidden="true">
                      →
                    </span>
                  </button>
                </div>
              </div>

              <div className={styles.tracesPanel}>
                {feedError && (
                  <p
                    role="status"
                    aria-live="polite"
                    className={styles.traceNotice}
                  >
                    {feedStatus === 'stale'
                      ? 'Showing the last known good snapshot. '
                      : ''}
                    {feedError}
                  </p>
                )}

                {!loaded ? (
                  <p className={styles.traceEmpty}>Reading the ether…</p>
                ) : feedStatus === 'error' && posts.length === 0 ? (
                  <p className={styles.traceEmpty}>
                    The chronicle is temporarily unavailable.
                  </p>
                ) : posts.length === 0 ? (
                  <p className={styles.traceEmpty}>
                    No eligible ritual traces yet. Completed rituals will appear
                    here.
                  </p>
                ) : (
                  <ol
                    className={styles.traceList}
                    aria-label="Latest completed ritual traces"
                  >
                    {posts.map(post => {
                      const IconComponent = post.icon || Radio;
                      const action = getTraceAction(post.type);
                      const fullText = `${post.label} — ${post.author} — ${
                        post.content || action
                      }`;

                      return (
                        <li
                          key={post.id}
                          className={styles.traceRow}
                          title={fullText}
                          aria-label={fullText}
                        >
                          <span className={styles.traceIdentity}>
                            <span
                              className={styles.traceIcon}
                              aria-hidden="true"
                              style={{ color: post.accent }}
                            >
                              <IconComponent size={14} />
                            </span>
                            <span className={styles.traceLabel}>
                              {post.label}
                            </span>
                          </span>

                          <span className={styles.traceBody}>
                            <span className={styles.traceText}>
                              {post.content || action}
                            </span>
                            <span className={styles.traceAuthor}>
                              · {post.author}
                            </span>
                          </span>

                          <time
                            dateTime={post.createdAt}
                            className={styles.traceTime}
                          >
                            {post.time}
                          </time>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </section>

            <section
              className={`${styles.section} ${styles.chambersSection}`}
              aria-labelledby="chambers-title"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <h2 id="chambers-title" className={styles.sectionTitle}>
                    Chambers
                  </h2>
                  <p className={styles.sectionNote}>
                    A small library of rooms to wander
                  </p>
                </div>
              </div>

              <ul className={styles.chamberGrid}>
                {CHAMBERS.map(([label, href], index) => (
                  <li key={href} className={styles.chamberItem}>
                    <Link href={href} className={styles.chamberLink}>
                      <span className={styles.chamberIndex} aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className={styles.chamberLabel}>{label}</span>
                      <span className={styles.chamberArrow} aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </main>

          <footer className={styles.footer}>
            <p className={styles.footerMark}>The Sanctuary · Digital Temple</p>

            <div className={styles.footerActions}>
              <button
                type="button"
                onClick={() => setIsChroniclesOpen(true)}
                className={styles.ghostButton}
              >
                <Activity size={12} className="mr-1.5" aria-hidden="true" />
                Chronicles
              </button>

              <button
                type="button"
                onClick={() => setIsInfoOpen(true)}
                className={styles.ghostButton}
                aria-label="Open Sanctuary information"
              >
                Info
              </button>
            </div>
          </footer>
        </div>

        <aside
          className={`${styles.rail} ${styles.railRight}`}
          data-testid="temple-right-rail"
          aria-label="Stained-glass Demon"
        >
          <figure className={`${styles.panel} ${styles.panelRight}`}>
            <Image
              data-testid="temple-right-panel"
              src={TEMPLE_HOME_ASSETS.right}
              alt="Stained-glass Demon"
              width={896}
              height={1200}
              sizes="(min-width: 1024px) 16rem, 32vw"
              className={styles.panelImage}
              priority
            />
            <figcaption className={styles.panelCaption}>Demon</figcaption>
          </figure>
        </aside>
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
              className={styles.modalOverlay}
            >
              <motion.div
                initial={{ scale: 0.97, y: 8 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.97, y: 8 }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="temple-info-title"
                className={styles.modalPanel}
              >
                <button
                  onClick={() => setIsInfoOpen(false)}
                  aria-label="Close Sanctuary information"
                  className={styles.modalClose}
                >
                  <X size={16} />
                </button>

                <h3 id="temple-info-title" className={styles.modalTitle}>
                  The Sanctuary
                </h3>

                <p className={styles.modalLead}>
                  This digital temple is a quiet space of presence. It stays
                  light at every hour. Here, rituals work, and every visitor
                  leaves a trace.
                </p>
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
              className={styles.modalOverlay}
            >
              <motion.div
                initial={{ scale: 0.97, y: 8 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.97, y: 8 }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="temple-chronicles-title"
                className={styles.modalPanel}
              >
                <div className={styles.modalHead}>
                  <div>
                    <h3 id="temple-chronicles-title" className={styles.modalTitle}>
                      Chronicles
                    </h3>
                    <p className={styles.supportStatus} style={{ textAlign: 'left' }}>
                      {statsWindowLabel} · cached for{' '}
                      {templeFeed?.meta.ttlSeconds ?? 60}s
                    </p>
                  </div>

                  <button
                    onClick={() => setIsChroniclesOpen(false)}
                    aria-label="Close Chronicles"
                    className={styles.modalClose}
                    style={{ position: 'static' }}
                  >
                    <X size={16} />
                  </button>
                </div>

                {feedError && (
                  <p role="status" className={styles.traceNotice}>
                    {feedStatus === 'stale'
                      ? 'Showing the last known good snapshot. '
                      : ''}
                    {feedError}
                  </p>
                )}

                <div className={styles.statGrid}>
                  <div className={styles.stat}>
                    <Users size={18} aria-hidden="true" />
                    <span className={styles.statValue}>
                      {stats.namedAuthors}
                    </span>
                    <span className={styles.statLabel}>Named Authors</span>
                    <span className={styles.statNote}>
                      Distinct display names — not verified unique people
                    </span>
                  </div>

                  <div className={styles.stat}>
                    <Activity size={18} aria-hidden="true" />
                    <span className={styles.statValue}>
                      {stats.completedRituals}
                    </span>
                    <span className={styles.statLabel}>
                      Completed Rituals
                    </span>
                    <span className={styles.statNote}>
                      Eligible ritual events in the full window
                    </span>
                  </div>

                  <div className={styles.stat}>
                    <Flame size={18} className="text-amber-600" aria-hidden="true" />
                    <span className={styles.statValue}>
                      {stats.vigilSparks}
                    </span>
                    <span className={styles.statLabel}>Vigil Sparks</span>
                    <span className={styles.statNote}>
                      VIGIL and VIGIL_SPARK events in the same window
                    </span>
                  </div>

                  <div className={styles.stat}>
                    <Clock size={18} className="text-indigo-500" aria-hidden="true" />
                    <span className={styles.statValue}>{sanctuaryHour}:00</span>
                    <span className={styles.statLabel}>Sanctuary Hour</span>
                    <span className={styles.statNote}>
                      Current device time (local, not a dataset metric)
                    </span>
                  </div>
                </div>

                {(excludedNote || stats.truncated) && (
                  <p className={styles.modalNote}>
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
    </div>
  );
}
