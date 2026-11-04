'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { motion, AnimatePresence } from 'framer-motion';

import TempleTopBar from '@/components/TempleTopBar';
import { readPierrotTributeAttribution } from '@/lib/pierrot/orderAttribution';
import {
  MAX_TRIBUTE_AMOUNT,
  MIN_TRIBUTE_AMOUNT,
  isPartialTributeAmount,
  parseTributeAmountInput,
} from '@/lib/tributes/amount';
import {
  isTributeTempleLogEvent,
  tributeSignalDonorName,
} from '@/lib/tributes/realtime';

const HEART_VIDEO =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-5300087847065473569.mp4';

const PRESETS = [5, 20, 100];
const PENDING_SESSION_KEY = 'tribute_pending_session_v1';
const OPEN_TIMEOUT_MS = 20_000;
const FOCUS_VERIFY_THROTTLE_MS = 5_000;

const supabase = createClient();

type PaymentState =
  | 'verifying'
  | 'confirmed'
  | 'processing'
  | 'cancelled'
  | 'failed';

type PaymentResult = {
  state: PaymentState;
  title: string;
  detail: string;
};

type VerificationPayload = {
  status?: string;
  amount?: number | null;
  currency?: string;
  message?: string;
};

type CheckoutResponse = {
  url?: string;
  sessionId?: string;
  error?: string;
  message?: string;
};

type TelegramWebApp = {
  openLink?: (
    url: string,
    options?: { try_instant_view?: boolean }
  ) => void;
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy') => void;
    notificationOccurred?: (
      type: 'success' | 'error' | 'warning'
    ) => void;
  };
};

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;

  const webApp = (
    window as Window & {
      Telegram?: { WebApp?: TelegramWebApp };
    }
  ).Telegram?.WebApp;

  return webApp && typeof webApp === 'object' ? webApp : null;
}

function readPendingSession(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.sessionStorage.getItem(PENDING_SESSION_KEY);
  } catch {
    return null;
  }
}

function writePendingSession(sessionId: string | null) {
  if (typeof window === 'undefined') return;

  try {
    if (sessionId) {
      window.sessionStorage.setItem(PENDING_SESSION_KEY, sessionId);
    } else {
      window.sessionStorage.removeItem(PENDING_SESSION_KEY);
    }
  } catch {
    // Checkout still works when sessionStorage is blocked.
  }
}

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export default function TributePage() {
  const [amount, setAmount] = useState<number>(20);
  const [isCustom, setIsCustom] = useState(false);
  const [customText, setCustomText] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [total24h, setTotal24h] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [lastDonor, setLastDonor] = useState<string | null>(null);

  const [result, setResult] = useState<PaymentResult | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(
    null
  );

  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const donorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryRequestRef = useRef(0);
  const lastFocusVerifyRef = useRef(0);

  const fetchTotal = useCallback(async () => {
    const requestId = summaryRequestRef.current + 1;
    summaryRequestRef.current = requestId;

    try {
      const response = await fetch('/api/tribute/summary', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error(`Tribute summary failed (${response.status})`);
      }

      const payload = await response.json().catch(() => null);

      if (summaryRequestRef.current !== requestId) return;

      const total = Number(payload?.total);

      setTotal24h(Number.isFinite(total) && total > 0 ? total : 0);
    } catch (error) {
      console.error('Tribute total error:', error);
    }
  }, []);

  const triggerHaptic = useCallback(
    (style: 'light' | 'medium' | 'heavy') => {
      try {
        const tg = getTelegramWebApp();

        if (tg?.HapticFeedback?.impactOccurred) {
          tg.HapticFeedback.impactOccurred(style);
        }
      } catch {
        // Telegram haptics are optional.
      }
    },
    []
  );

  const triggerNotification = useCallback(
    (type: 'success' | 'error' | 'warning') => {
      try {
        const tg = getTelegramWebApp();

        if (tg?.HapticFeedback?.notificationOccurred) {
          tg.HapticFeedback.notificationOccurred(type);
        }
      } catch {
        // Telegram haptics are optional.
      }
    },
    []
  );

  const triggerPulse = useCallback(
    (donorName: string | null) => {
      setPulse(true);
      setLastDonor(donorName?.trim() || 'PILGRIM');

      triggerHaptic('heavy');

      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current);
      }

      if (donorTimeoutRef.current) {
        clearTimeout(donorTimeoutRef.current);
      }

      pulseTimeoutRef.current = setTimeout(() => {
        setPulse(false);
        pulseTimeoutRef.current = null;
      }, 800);

      donorTimeoutRef.current = setTimeout(() => {
        setLastDonor(null);
        donorTimeoutRef.current = null;
      }, 4000);
    },
    [triggerHaptic]
  );

  const verifySession = useCallback(
    async (sessionId: string) => {
      setPendingSessionId(sessionId);
      writePendingSession(sessionId);

      setResult((previous) =>
        previous?.state === 'confirmed'
          ? previous
          : {
              state: 'verifying',
              title: 'Confirming with the Temple',
              detail:
                'Checking the payment directly with Stripe. The browser return alone is not treated as confirmation.',
            }
      );

      try {
        const response = await fetch(
          `/api/tribute/verify?session_id=${encodeURIComponent(sessionId)}`,
          {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
          }
        );

        const payload: VerificationPayload = await response
          .json()
          .catch(() => ({}));

        if (payload.status === 'confirmed') {
          const received =
            typeof payload.amount === 'number' && payload.amount > 0
              ? `$${formatAmount(payload.amount)}`
              : 'Your tribute';

          setResult({
            state: 'confirmed',
            title: 'Tribute received',
            detail: `${received} has reached the Temple. Thank you for keeping the Sanctuary alive.`,
          });

          setPendingSessionId(null);
          writePendingSession(null);
          triggerNotification('success');
          void fetchTotal();

          return;
        }

        if (payload.status === 'cancelled') {
          setResult({
            state: 'cancelled',
            title: 'Checkout closed',
            detail:
              'No payment was completed. The flame is unchanged, and you can offer again whenever you wish.',
          });

          setPendingSessionId(null);
          writePendingSession(null);

          return;
        }

        if (payload.status === 'failed') {
          setResult({
            state: 'failed',
            title: 'Payment not confirmed',
            detail:
              payload.message ||
              'This checkout could not be verified. No successful donation was recorded.',
          });

          setPendingSessionId(null);
          writePendingSession(null);
          triggerNotification('error');

          return;
        }

        setResult({
          state: 'processing',
          title: 'Awaiting confirmation',
          detail:
            payload.message ||
            'No payment has been confirmed yet. If you completed it, confirmation may take a moment. If you cancelled, nothing was charged.',
        });

        setPendingSessionId(sessionId);
        triggerNotification('warning');
      } catch (error) {
        console.error('Tribute verification error:', error);

        setResult({
          state: 'processing',
          title: 'Confirmation delayed',
          detail:
            'The Temple could not be reached to confirm the payment. You can check again without creating another donation.',
        });

        setPendingSessionId(sessionId);
        writePendingSession(sessionId);
      }
    },
    [fetchTotal, triggerNotification]
  );

  useEffect(() => {
    void fetchTotal();

    const channel = supabase
      .channel('tribute-live')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'temple_log',
          filter: 'event_type=eq.TRIBUTE',
        },
        (payload) => {
          const newRow = payload.new as
            | { event_type?: unknown; author?: unknown }
            | null;

          if (!isTributeTempleLogEvent(newRow)) return;

          triggerPulse(tributeSignalDonorName(newRow));
          void fetchTotal();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Tribute realtime channel error');
        }
      });

    return () => {
      supabase.removeChannel(channel);

      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current);
        pulseTimeoutRef.current = null;
      }

      if (donorTimeoutRef.current) {
        clearTimeout(donorTimeoutRef.current);
        donorTimeoutRef.current = null;
      }

      if (openTimeoutRef.current) {
        clearTimeout(openTimeoutRef.current);
        openTimeoutRef.current = null;
      }
    };
  }, [fetchTotal, triggerPulse]);

  // Handle the return URL. `status=success` is only a hint: verification
  // against Stripe decides whether a tribute is confirmed.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const sessionId = params.get('session_id');

    if (status === 'cancel') {
      setResult({
        state: 'cancelled',
        title: 'Checkout closed',
        detail:
          'No payment was completed. The flame is unchanged, and you can offer again whenever you wish.',
      });

      setPendingSessionId(null);
      writePendingSession(null);

      return;
    }

    if (status === 'success') {
      if (!sessionId) {
        setResult({
          state: 'failed',
          title: 'Payment not confirmed',
          detail:
            'The return link did not include a checkout reference. No successful donation was recorded.',
        });

        return;
      }

      void verifySession(sessionId);

      return;
    }

    const pending = readPendingSession();

    if (pending) {
      void verifySession(pending);
    }
  }, [verifySession]);

  // Telegram openLink leaves the Mini App alive in the background. On return,
  // release the loading state and verify a pending checkout without a polling
  // loop. This also covers browser bfcache restores.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleReturn = () => {
      if (document.visibilityState === 'hidden') return;

      setLoading(false);

      if (openTimeoutRef.current) {
        clearTimeout(openTimeoutRef.current);
        openTimeoutRef.current = null;
      }

      const pending = readPendingSession();

      if (!pending) return;

      const now = Date.now();

      if (now - lastFocusVerifyRef.current < FOCUS_VERIFY_THROTTLE_MS) {
        return;
      }

      lastFocusVerifyRef.current = now;
      void verifySession(pending);
    };

    window.addEventListener('focus', handleReturn);
    window.addEventListener('pageshow', handleReturn);
    document.addEventListener('visibilitychange', handleReturn);

    return () => {
      window.removeEventListener('focus', handleReturn);
      window.removeEventListener('pageshow', handleReturn);
      document.removeEventListener('visibilitychange', handleReturn);
    };
  }, [verifySession]);

  const selectedAmount = amount;
  const canSubmit =
    Number.isFinite(selectedAmount) &&
    selectedAmount >= MIN_TRIBUTE_AMOUNT &&
    selectedAmount <= MAX_TRIBUTE_AMOUNT;
  const busy = loading || result?.state === 'verifying';

  const handleTribute = async () => {
    const submitAmount = isCustom
      ? parseTributeAmountInput(customText)
      : amount;

    if (busy) return;

    if (submitAmount === null || !Number.isFinite(submitAmount)) {
      setErrorMsg(
        `Enter an amount between $${MIN_TRIBUTE_AMOUNT} and $${formatAmount(
          MAX_TRIBUTE_AMOUNT
        )}.`
      );
      return;
    }

    triggerHaptic('medium');
    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const donorName =
        typeof window !== 'undefined'
          ? localStorage.getItem('temple_user') || 'Pilgrim'
          : 'Pilgrim';

      const pierrotAttribution = readPierrotTributeAttribution(
        typeof window !== 'undefined' ? window.location.search : null
      );

      const res = await fetch('/api/tribute/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(submitAmount * 100) / 100,
          currency: 'usd',
          donor_name: donorName,
          message: 'Fuel for the Temple',
          ...(pierrotAttribution ? { pierrotAttribution } : {}),
        }),
      });

      let data: CheckoutResponse = {};
      const contentType = res.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        data = (await res.json().catch(() => ({}))) as CheckoutResponse;
      } else {
        const text = await res.text().catch(() => '');
        data = { error: text || 'Invalid server response.' };
      }

      if (!res.ok) {
        throw new Error(
          data.error ||
            data.message ||
            `Payment gateway busy (${res.status}). Try again.`
        );
      }

      if (!data.url) {
        throw new Error('Payment link generation failed.');
      }

      if (typeof data.sessionId === 'string' && data.sessionId) {
        setPendingSessionId(data.sessionId);
        writePendingSession(data.sessionId);
      }

      try {
        const tg = getTelegramWebApp();

        if (tg && typeof tg.openLink === 'function') {
          tg.openLink(data.url, { try_instant_view: false });
        } else {
          window.location.assign(data.url);
        }
      } catch {
        window.location.assign(data.url);
      }

      // If openLink fails silently, do not leave the interface frozen.
      openTimeoutRef.current = setTimeout(() => {
        setLoading(false);
        openTimeoutRef.current = null;
      }, OPEN_TIMEOUT_MS);
    } catch (error) {
      console.error('Tribute checkout error:', error);

      setErrorMsg(
        error instanceof Error
          ? error.message
          : 'Connection failed.'
      );
      setLoading(false);
      triggerNotification('error');
    }
  };

  const getHeartStyle = () => {
    let filter =
      'grayscale(80%) sepia(60%) brightness(0.8) contrast(1.1)';
    let scale = 1;
    let opacity = 0.9;

    if (total24h > 50) {
      filter =
        'grayscale(20%) sepia(30%) brightness(1.1) contrast(1.05) saturate(1.3)';
      opacity = 1;
    }

    if (total24h > 200) {
      filter =
        'grayscale(0%) sepia(0%) brightness(1.2) contrast(1.0) saturate(1.6)';
      scale = 1.06;
    }

    if (pulse) {
      scale = 1.25;
      filter = 'brightness(1.5) saturate(2.2)';
      opacity = 1;
    }

    return {
      filter,
      scale,
      opacity,
    };
  };

  const style = getHeartStyle();

  const resultStyles: Record<PaymentState, string> = {
    verifying: 'border-stone-600/60 bg-stone-900/80 text-stone-200',
    confirmed: 'border-amber-300/50 bg-amber-950/30 text-amber-100',
    processing: 'border-amber-300/30 bg-stone-900/80 text-stone-200',
    cancelled: 'border-stone-700/70 bg-stone-900/80 text-stone-300',
    failed: 'border-rose-500/40 bg-rose-950/25 text-rose-100',
  };

  return (
    <div
      className="tribute-page relative flex w-full flex-col overflow-x-hidden bg-[#141210] font-sans text-stone-200"
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% 40%, rgba(55, 40, 32, 0.75) 0%, rgba(20, 18, 16, 1) 90%)',
      }}
    >
      <div className="noise-overlay" />

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-amber-900/40 via-orange-950/20 to-transparent blur-[120px]" />

      <TempleTopBar />

      <section className="tribute-main relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 sm:px-8">
        <header className="mb-5 text-center sm:mb-6">
          <h1 className="text-2xl font-semibold tracking-[0.3em] text-stone-100 sm:text-3xl">
            TRIBUTE
          </h1>

          <div
            className="mt-2 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-stone-400"
            aria-live="polite"
          >
            Radiant Energy: ${total24h.toFixed(0)} / 24H
          </div>
        </header>

        {result && (
          <div
            className={`mb-5 w-full rounded-2xl border px-4 py-3 text-center shadow-lg backdrop-blur-md ${resultStyles[result.state]}`}
            role={result.state === 'failed' ? 'alert' : 'status'}
            aria-live={result.state === 'failed' ? 'assertive' : 'polite'}
          >
            <p className="font-serif text-sm tracking-wide">{result.title}</p>

            <p className="mt-1 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] opacity-80">
              {result.detail}
            </p>

            {result.state === 'processing' && pendingSessionId && (
              <button
                type="button"
                onClick={() => void verifySession(pendingSessionId)}
                className="mt-3 min-h-[44px] rounded-full border border-amber-300/30 bg-white/5 px-4 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-100 transition-colors hover:bg-white/10"
              >
                Check payment status
              </button>
            )}

            {result.state === 'cancelled' && (
              <button
                type="button"
                onClick={() => setResult(null)}
                className="mt-3 min-h-[44px] rounded-full border border-white/15 bg-white/5 px-4 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-200 transition-colors hover:bg-white/10"
              >
                Offer light
              </button>
            )}
          </div>
        )}

        <div className="tribute-heart relative mb-6 flex h-44 w-44 items-center justify-center sm:mb-7 sm:h-56 sm:w-56">
          <div
            className="absolute inset-0 rounded-full bg-amber-700/10 blur-3xl transition-opacity duration-700"
            style={{
              opacity: pulse ? 1 : Math.max(total24h / 250, 0.35),
            }}
          />

          <video
            src={HEART_VIDEO}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-label="Radiant Heart"
            className="relative h-full w-full rounded-full border border-white/10 object-cover"
            style={{
              filter: style.filter,
              transform: `scale(${style.scale})`,
              opacity: style.opacity,
              transition:
                'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              boxShadow: pulse
                ? '0 0 80px rgba(245,158,11,0.45)'
                : '0 0 55px rgba(120,75,20,0.25)',
            }}
          />

          <AnimatePresence>
            {lastDonor && (
              <motion.div
                initial={{
                  opacity: 0,
                  y: 20,
                  scale: 0.9,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                }}
                exit={{
                  opacity: 0,
                  y: -15,
                  scale: 0.9,
                }}
                role="status"
                className="absolute -bottom-9 w-full rounded-full border border-amber-300/25 bg-stone-950/75 px-3 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-stone-200 shadow-lg backdrop-blur-md"
              >
                <span className="text-amber-400">♥</span>{' '}
                {lastDonor} offered light
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="w-full rounded-3xl border border-stone-800/80 bg-stone-900/90 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="flex gap-2.5">
            {PRESETS.map((value) => {
              const active = amount === value && !isCustom;

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setAmount(value);
                    setCustomText('');
                    setIsCustom(false);
                    setErrorMsg(null);
                    triggerHaptic('light');
                  }}
                  className={`h-11 min-h-[44px] flex-1 rounded-full border px-3 font-mono text-xs tracking-wider transition-all active:scale-95 ${
                    active
                      ? 'border-amber-300/60 bg-white/15 text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.12)]'
                      : 'border-white/15 bg-white/5 text-stone-400 hover:border-amber-300/40 hover:bg-white/10 hover:text-stone-200'
                  }`}
                >
                  ${value}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setIsCustom(true);
                setAmount(0);
                setCustomText('');
                setErrorMsg(null);
                triggerHaptic('light');
              }}
              className={`h-11 min-h-[44px] w-12 rounded-full border font-mono text-xs transition-all active:scale-95 ${
                isCustom
                  ? 'border-amber-300/60 bg-white/15 text-amber-200'
                  : 'border-white/15 bg-white/5 text-stone-400 hover:border-amber-300/40 hover:bg-white/10 hover:text-stone-200'
              }`}
              aria-label="Custom tribute amount"
              aria-pressed={isCustom}
            >
              …
            </button>
          </div>

          <AnimatePresence>
            {isCustom && (
              <motion.input
                initial={{
                  height: 0,
                  opacity: 0,
                }}
                animate={{
                  height: 'auto',
                  opacity: 1,
                }}
                exit={{
                  height: 0,
                  opacity: 0,
                }}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                pattern="[0-9]*[.,]?[0-9]{0,2}"
                aria-label="Custom tribute amount in US dollars"
                className="mt-4 min-h-[48px] w-full rounded-xl border border-white/15 bg-white/5 p-3.5 text-center font-mono text-lg text-amber-200 outline-none transition-colors placeholder:text-stone-600 focus:border-amber-400/60 focus:bg-white/10"
                placeholder="ENTER AMOUNT"
                value={customText}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const next = e.target.value;

                  if (!isPartialTributeAmount(next)) return;

                  setCustomText(next);
                  setAmount(
                    parseTributeAmountInput(next) ?? 0
                  );
                  setErrorMsg(null);
                }}
                autoFocus
              />
            )}
          </AnimatePresence>

          {errorMsg && (
            <div
              className="mt-4 text-center font-mono text-[10px] uppercase tracking-widest text-rose-400"
              role="alert"
            >
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            onClick={handleTribute}
            disabled={busy || !canSubmit}
            className="mt-5 flex h-12 min-h-[48px] w-full items-center justify-center rounded-full border border-amber-300/30 bg-white/10 px-5 font-serif text-xs uppercase tracking-[0.18em] text-stone-100 shadow-md backdrop-blur-md transition-all hover:border-amber-300/60 hover:bg-white/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy
              ? result?.state === 'verifying'
                ? 'Verifying...'
                : 'Radiating...'
              : canSubmit
                ? `Offer $${formatAmount(selectedAmount)} for the Temple`
                : 'Enter an amount'}
          </button>

          <p className="mt-5 text-center font-mono text-[9px] uppercase leading-relaxed tracking-[0.12em] text-stone-500">
            Your tribute nourishes the Sanctuary.
            <br />
            Energy flows, expands, and illuminates all.
          </p>
        </div>
      </section>

      {/* eslint-disable-next-line react/no-unknown-property */}
      <style jsx global>{`
        .noise-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          opacity: 0.04;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' fill='white'/%3E%3C/svg%3E");
          z-index: 1;
        }
      `}</style>
    </div>
  );
}
