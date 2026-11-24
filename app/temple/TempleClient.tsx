// app/temple/page.tsx

'use client';

import React, { useCallback, useState, useEffect } from 'react';
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
import { globalFlameRemainingMs } from '@/lib/vigil/flame';
import { vigilHeartVisuals } from '@/lib/vigil/supporters';
import { useVigilSupporters } from '@/hooks/useVigilSupporters';
import { trackTributeSupportView } from '@/lib/tributes/analytics';

const ASSETS = {
  heart:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png',
  angel:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png',
  daemon:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Daemon1.png',
};

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

const DEFAULT_LIGHTING = {
  bg: 'bg-[#FAF8F5]',
  text: 'text-stone-900',
  subText: 'text-stone-600',
  glow: 'from-stone-200/40 via-transparent to-transparent',
  vignette:
    'radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.8) 0%, rgba(250, 248, 245, 1) 85%)',
  cardBg:
    'bg-white/95 border-stone-200 text-stone-900 shadow-2xl backdrop-blur-2xl'
};

function getTimeLighting() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 11) {
    return {
      bg: 'bg-[#F5F2EB]',
      text: 'text-stone-900',
      subText: 'text-stone-600',
      glow: 'from-amber-200/30 via-orange-100/10 to-transparent',
      vignette:
        'radial-gradient(circle at 50% 30%, rgba(255, 243, 224, 0.6) 0%, rgba(245, 242, 235, 1) 80%)',
      cardBg:
        'bg-white/95 border-stone-200 text-stone-900 shadow-2xl backdrop-blur-2xl'
    };
  }

  if (hour >= 11 && hour < 17) {
    return DEFAULT_LIGHTING;
  }

  if (hour >= 17 && hour < 21) {
    return {
      bg: 'bg-[#1f1a18]',
      text: 'text-stone-100',
      subText: 'text-stone-300',
      glow: 'from-orange-900/30 via-rose-950/20 to-transparent',
      vignette:
        'radial-gradient(circle at 50% 40%, rgba(70, 35, 25, 0.4) 0%, rgba(31, 26, 24, 1) 90%)',
      cardBg:
        'bg-stone-900/95 border-stone-800 text-stone-100 shadow-2xl backdrop-blur-2xl'
    };
  }

  return {
    bg: 'bg-[#0b0c10]',
    text: 'text-stone-200',
    subText: 'text-stone-400',
    glow: 'from-indigo-950/50 via-blue-950/20 to-transparent',
    vignette:
      'radial-gradient(circle at 50% 30%, rgba(20, 25, 45, 0.5) 0%, rgba(11, 12, 16, 1) 90%)',
    cardBg:
      'bg-zinc-900/95 border-zinc-800 text-zinc-100 shadow-2xl backdrop-blur-2xl'
  };
}

export default function TempleClient() {
  const pathname = usePathname();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isTracesOpen, setIsTracesOpen] = useState(false);
  const [isChroniclesOpen, setIsChroniclesOpen] = useState(false);
  const [lighting, setLighting] = useState(DEFAULT_LIGHTING);
  const [tgUser, setTgUser] = useState<any>(null);
  const isTelegramApp = useIsTelegram();

  const [posts, setPosts] = useState<TemplePost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [vigilNow, setVigilNow] = useState(() => Date.now());
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

  const [stats, setStats] = useState({
    totalLogs: 0,
    uniqueAuthors: 0,
    vigilsCount: 0,
    letItGoCount: 0,
    sanctuaryHour: 12
  });

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

    setLighting(getTimeLighting());

    setStats(prev => ({
      ...prev,
      sanctuaryHour: new Date().getHours()
    }));

    const timer = setInterval(() => {
      setLighting(getTimeLighting());

      setStats(prev => ({
        ...prev,
        sanctuaryHour: new Date().getHours()
      }));
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
    if (pathname !== '/temple') return;
    let cancelled = false;

    async function fetchLogs() {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }

      try {
        const res = await fetch('/api/temple_logs', {
          cache: 'no-store'
        });

        if (!res.ok) return;

        const json = await res.json();

        if (cancelled || !json || !Array.isArray(json.data)) {
          return;
        }

        const rawData = json.data;

        const ritualLogs = rawData.filter((item: any) => {
          const type = String(item.event_type || '').toLowerCase();

          return type !== 'enter' && type !== 'nav';
        });

        const formatted: TemplePost[] = ritualLogs.map(
          (item: any, index: number) => {
            const type = (
              item.event_type || 'WHISPER'
            ).toUpperCase();

            const visuals = getEventVisuals(type);

            let cleanContent = String(item.message ?? '');
            const cleanAuthor = item.author || 'Anonymous';

            if (
              type === 'ABSOLUTION' &&
              cleanContent.includes('confessed:')
            ) {
              const splitMsg = cleanContent.split('confessed:');

              if (splitMsg.length > 1) {
                cleanContent = `Confessed:${splitMsg
                  .slice(1)
                  .join('confessed:')}`;
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
              color: visuals.color
            };
          }
        );

        if (!cancelled) {
          setPosts(formatted);

          const authorsSet = new Set(
            ritualLogs.map((i: any) => i.author).filter(Boolean)
          );

          const vigils = ritualLogs.filter((i: any) =>
            ['VIGIL', 'VIGIL_SPARK'].includes(
              String(i.event_type || '').toUpperCase()
            )
          ).length;

          const ashes = ritualLogs.filter(
            (i: any) =>
              String(i.event_type || '').toUpperCase() === 'ASH'
          ).length;

          setStats({
            totalLogs: ritualLogs.length,
            uniqueAuthors: authorsSet.size,
            vigilsCount: vigils,
            letItGoCount: ashes,
            sanctuaryHour: new Date().getHours()
          });
        }
      } catch (e) {
        console.warn('Failed to fetch temple logs', e);
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    }

    fetchLogs();

    const interval = setInterval(fetchLogs, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pathname]);

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

  const actionButtonStyle =
    lighting.bg.includes('1f1a18') ||
    lighting.bg.includes('0b0c10')
      ? 'bg-white/10 border-white/20 text-stone-200 hover:bg-white/20'
      : 'bg-white/80 border-stone-300 text-stone-900 hover:bg-white';

  const ritualButtonStyle = `w-full min-h-[54px] px-4 py-3 rounded-2xl backdrop-blur-md border shadow-sm font-serif text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 cursor-pointer text-center flex items-center justify-center ${actionButtonStyle}`;
  const ritualAccent: Record<string, string> = {
    '/heartandangel/calm': 'border-sky-400/30',
    '/heartandangel/letitgo': 'border-rose-400/30',
    '/absolution': 'border-emerald-400/30',
    '/cast': 'border-indigo-400/30',
  };

  return (
    <div
      className={`relative w-full temple-screen telegram-viewport-min ${lighting.bg} ${lighting.text} font-sans overflow-x-hidden select-none flex flex-col justify-between px-4 sm:px-8 md:px-12 pt-4 pb-10 transition-colors duration-1000`}
      style={{ backgroundImage: lighting.vignette }}
    >
      <h1 className="relative z-40 mx-auto w-full max-w-5xl px-4 pt-20 font-serif text-xs uppercase tracking-[0.3em] opacity-70 sm:pt-24">
        The Sanctuary — Digital Temple
      </h1>

      {!isTelegramApp && (
        <header className="relative z-40 flex items-center justify-between w-full max-w-5xl mx-auto px-2 sm:px-4 pt-2 pb-2">
          <div className="flex items-center">
            <Link
              href="/heartandangel/world"
              className={`flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md border shadow-sm transition-all text-xs font-serif tracking-wider cursor-pointer ${actionButtonStyle}`}
            >
              <span>← Back to World</span>
            </Link>
          </div>

          <SoundToggle
            className={`px-3 py-2 border shadow-sm ${actionButtonStyle}`}
          />
        </header>
      )}

      {isTelegramApp && tgUser && (
        <div className="relative z-40 flex items-center justify-between w-full max-w-5xl mx-auto px-2 sm:px-4 py-1">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-serif">
            <Send size={12} className="text-emerald-500" />
            <span className="opacity-80">
              @{tgUser.username || tgUser.first_name}
            </span>
          </div>
        </div>
      )}

      <div className="relative w-full flex-1 px-2 sm:px-4 py-5 sm:py-7">
        <div
          className={`absolute w-[280px] h-[280px] sm:w-[450px] sm:h-[450px] rounded-full bg-gradient-to-tr ${lighting.glow} blur-[90px] pointer-events-none transition-all duration-1000`}
        />

        <div className="relative z-30 max-w-5xl mx-auto w-full">
          <div className="relative mx-auto w-full max-w-4xl">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-2 top-1/2 h-28 -translate-y-1/2 rounded-[50%] bg-gradient-to-r from-transparent via-amber-200/15 to-transparent blur-2xl sm:h-40"
            />

            <div
              className="relative grid grid-cols-[minmax(0,1fr)_minmax(7.5rem,13rem)_minmax(0,1fr)] items-center gap-1 sm:gap-5"
              aria-label="Heart, Angel and Demon"
            >
              <div className="relative h-40 sm:h-64 lg:h-72">
                <div className="absolute inset-x-0 bottom-0 top-4 overflow-hidden rounded-t-[999px] rounded-b-2xl border border-amber-100/15 bg-white/[0.035] shadow-[inset_0_0_35px_rgba(0,0,0,0.28)]">
                  <Image
                    src={ASSETS.angel}
                    alt="Stained-glass Angel"
                    fill
                    sizes="(min-width: 1024px) 288px, (min-width: 640px) 240px, 120px"
                    className="object-contain p-1 sm:p-2"
                    priority
                  />
                </div>
              </div>

              <RitualLink
                href="/vigil"
                aria-label={`Light the Vigil heart. ${supporterLabel} in the last 24 hours. ${vigilLabel}.`}
                className="group flex min-w-0 flex-col items-center text-center"
              >
                <div className="relative flex h-32 w-32 items-center justify-center sm:h-52 sm:w-52">
                  <div
                    aria-hidden="true"
                    className="absolute inset-2 rounded-full bg-amber-400/30 transition-all duration-700"
                    style={{
                      opacity: heartVisuals.glowOpacity,
                      filter: `blur(${heartVisuals.glowBlurPx}px)`,
                      transform: `scale(${heartVisuals.scale})`,
                    }}
                  />

                  <div className="relative h-full w-full">
                    <Image
                      data-testid="temple-heart"
                      src={ASSETS.heart}
                      alt="Shared Temple heart"
                      fill
                      sizes="(min-width: 640px) 208px, 128px"
                      className="object-contain transition-all duration-700 group-hover:scale-105"
                      style={{
                        filter: `grayscale(${heartVisuals.grayscale}) brightness(${heartVisuals.brightness}) saturate(${heartVisuals.saturate})`,
                        transform: `scale(${heartVisuals.scale})`,
                      }}
                      priority
                    />
                  </div>
                </div>

                <span
                  className="mt-2 font-mono text-[10px] uppercase tracking-[.14em] sm:tracking-[.18em]"
                  data-supporter-count={
                    hasVigilState ? supporterCount : undefined
                  }
                >
                  {supporterLabel} · {vigilLabel}
                </span>

                {vigilStateProblem && (
                  <span
                    className="mt-1 max-w-[11rem] font-mono text-[9px] uppercase leading-tight tracking-[.12em] opacity-50"
                    role="status"
                    aria-live="polite"
                  >
                    {vigilStateProblem}
                  </span>
                )}

                <span className="mt-2 rounded-full border border-amber-400/30 px-4 py-2 font-serif text-xs">
                  Light the heart
                </span>
              </RitualLink>

              <div className="relative h-40 sm:h-64 lg:h-72">
                <div className="absolute inset-x-0 bottom-0 top-4 overflow-hidden rounded-t-[999px] rounded-b-2xl border border-amber-100/15 bg-white/[0.035] shadow-[inset_0_0_35px_rgba(0,0,0,0.28)]">
                  <Image
                    src={ASSETS.daemon}
                    alt="Stained-glass Demon"
                    fill
                    sizes="(min-width: 1024px) 288px, (min-width: 640px) 240px, 120px"
                    className="object-contain p-1 sm:p-2"
                    priority
                  />
                </div>
              </div>
            </div>

            <div
              aria-hidden="true"
              className="mx-auto mt-2 h-5 w-2/3 rounded-[50%] bg-black/10 blur-xl"
            />
          </div>

          <section className="mx-auto mt-8 w-full max-w-3xl" aria-labelledby="rituals-title">
            <h2 id="rituals-title" className="mb-4 text-center font-serif text-2xl">Rituals</h2>
            <div className="grid grid-cols-2 gap-3">
              {TEMPLE_RITUAL_LINKS.map((ritual) => (
                <RitualLink
                  key={ritual.href}
                  href={ritual.href}
                  className={`${ritualButtonStyle} ${ritualAccent[ritual.href] ?? 'border-amber-400/20'}`}
                >
                  {ritual.label}
                </RitualLink>
              ))}
            </div>

            <div className="mt-5 rounded-3xl border border-amber-400/20 bg-black/10 p-5 text-center backdrop-blur-md">
              <p className="font-serif text-lg">Support the Temple</p>
              <p className="mt-1 text-xs opacity-70">
                Vigil contributes a spark. Tribute materially sustains the Temple.
              </p>
              <button
                type="button"
                onClick={() => openTribute()}
                className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-full border border-amber-300/50 bg-amber-300/15 px-5 font-serif text-xs uppercase tracking-[.18em] transition-all hover:bg-amber-300/25"
              >
                Support the Temple →
              </button>
              <div className="mt-3 flex justify-center gap-2">
                {[5, 20, 100].map(amount => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => openTribute(amount)}
                    className="min-h-[44px] rounded-full border border-amber-400/30 px-4 py-2 font-mono text-xs transition-colors hover:border-amber-300/60"
                  >
                    ${amount}
                  </button>
                ))}
              </div>
            </div>

            {leftWithoutTrace && (
              <p
                className="mt-3 text-center font-mono text-[10px] uppercase tracking-[.18em] opacity-60"
                role="status"
              >
                Left without a trace
              </p>
            )}

            {/* Temple utilities */}
            <div className="flex items-center justify-center gap-2 mt-3 w-full">
              <button
                onClick={() => setIsChroniclesOpen(true)}
                className={`flex-1 py-2.5 px-2.5 rounded-xl backdrop-blur-md border shadow-sm flex items-center justify-center gap-1.5 transition-transform hover:scale-105 cursor-pointer font-serif text-[10px] tracking-widest uppercase ${actionButtonStyle}`}
              >
                <Activity size={12} className="opacity-80" />
                <span>Chronicles</span>
              </button>

              <button
                onClick={() => setIsTracesOpen(true)}
                className={`flex-1 py-2.5 px-2.5 rounded-xl backdrop-blur-md border shadow-sm flex items-center justify-center gap-1.5 transition-transform hover:scale-105 cursor-pointer font-serif text-[10px] tracking-widest uppercase ${actionButtonStyle}`}
              >
                <Layers size={12} className="opacity-80" />
                <span>Traces</span>
              </button>

              <button
                onClick={() => setIsInfoOpen(true)}
                className={`w-10 h-10 rounded-xl border backdrop-blur-sm shadow-sm flex items-center justify-center transition-transform hover:scale-105 cursor-pointer font-serif text-sm italic shrink-0 ${actionButtonStyle}`}
                title="About Temple"
                aria-label="Open Sanctuary information"
              >
                ?
              </button>
            </div>
          </section>

          <section className="mx-auto mt-10 max-w-4xl text-center" aria-labelledby="chambers-title">
            <h2 id="chambers-title" className="font-serif text-2xl">Chambers</h2>
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
              {[
                ['Heritage', '/heritage'], ['Media Archive', '/media'], ['Unframed', '/unframed'],
                ['Flow', '/flow'], ['Flow Issues', '/flow-issues'], ['Selection', '/selection'], ['Journal', '/journal'],
              ].map(([label, href]) => <Link key={href} href={href} className={`rounded-full border px-4 py-2 ${actionButtonStyle}`}>{label}</Link>)}
            </div>
          </section>
        </div>
      </div>

      <div className="h-4" />

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
              className={`${lighting.cardBg} rounded-3xl p-6 sm:p-8 max-w-md w-full border space-y-4 relative shadow-2xl`}
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
                This digital temple is a quiet space of presence. Lighting
                shifts with the real hours of the world. Here, rituals work,
                and every visitor leaves a trace.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              className={`${lighting.cardBg} rounded-3xl p-6 sm:p-8 max-w-2xl w-full border space-y-4 relative shadow-2xl max-h-[80vh] flex flex-col`}
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
                    Latest 10 ritual entries · entry and navigation events
                    hidden
                  </p>
                </div>

                <button
                  onClick={() => setIsTracesOpen(false)}
                  aria-label="Close Sanctuary Traces"
                  className="w-8 h-8 rounded-full bg-stone-500/20 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="divide-y divide-stone-500/10 overflow-y-auto pr-1 flex-1">
                {!loaded ? (
                  <p className="font-mono text-xs opacity-60 uppercase tracking-widest animate-pulse py-8 text-center">
                    Reading the ether...
                  </p>
                ) : posts.length === 0 ? (
                  <p className="font-mono text-xs opacity-60 uppercase tracking-widest py-8 text-center">
                    No traces recorded yet.
                  </p>
                ) : (
                  posts.slice(0, 10).map(post => {
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
              className={`${lighting.cardBg} rounded-3xl p-6 sm:p-8 max-w-md w-full border space-y-6 relative shadow-2xl`}
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
                    Latest 10 ritual entries · refreshes every 15 sec
                  </p>
                </div>

                <button
                  onClick={() => setIsChroniclesOpen(false)}
                  aria-label="Close Chronicles"
                  className="w-8 h-8 rounded-full bg-stone-500/20 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6 py-2">
                <div className="flex flex-col items-center justify-center text-center space-y-1">
                  <Users size={20} className="opacity-60 mb-1" />

                  <span className="font-mono text-3xl sm:text-4xl font-light tracking-tight">
                    {stats.uniqueAuthors}
                  </span>

                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">
                    Unique Seekers
                  </span>

                  <span className="text-[10px] font-serif opacity-50">
                    Named authors in these rituals
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center text-center space-y-1">
                  <Activity size={20} className="opacity-60 mb-1" />

                  <span className="font-mono text-3xl sm:text-4xl font-light tracking-tight">
                    {stats.totalLogs}
                  </span>

                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">
                    Recent Rituals
                  </span>

                  <span className="text-[10px] font-serif opacity-50">
                    Rituals in the latest 10 ritual entries
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center text-center space-y-1">
                  <Flame size={20} className="text-amber-500 mb-1" />

                  <span className="font-mono text-3xl sm:text-4xl font-light tracking-tight">
                    {stats.vigilsCount}
                  </span>

                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">
                    Vigil Sparks
                  </span>

                  <span className="text-[10px] font-serif opacity-50">
                    VIGIL events in that same set
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center text-center space-y-1">
                  <Clock size={20} className="text-indigo-400 mb-1" />

                  <span className="font-mono text-3xl sm:text-4xl font-light tracking-tight">
                    {stats.sanctuaryHour}:00
                  </span>

                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">
                    Sanctuary Hour
                  </span>

                  <span className="text-[10px] font-serif opacity-50">
                    Current device time (local)
                  </span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {tributeEntry && (
        <TempleTributeModal
          initialAmount={tributeEntry.amount}
          onClose={closeTribute}
        />
      )}
    </div>
  );
}
