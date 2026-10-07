'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { motion, AnimatePresence } from 'framer-motion';

import TempleTopBar from '@/components/TempleTopBar';

const HEART_VIDEO =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-5300087847065473569.mp4';

const PRESETS = [5, 20, 100];

type TributeRow = {
  status: string | null;
  donor_name: string | null;
};

const supabase = createClient();

export default function TributePage() {
  const [amount, setAmount] = useState<number>(20);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [total24h, setTotal24h] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [lastDonor, setLastDonor] = useState<string | null>(null);

  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const donorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTotal = useCallback(async () => {
    const yesterday = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await supabase
      .from('tributes')
      .select('amount_cents')
      .eq('status', 'succeeded')
      .gte('created_at', yesterday);

    if (error) {
      console.error('Tribute total error:', error);
      return;
    }

    const sumCents = (data ?? []).reduce(
      (acc: number, curr: { amount_cents: number | null }) =>
        acc + Number(curr.amount_cents || 0),
      0
    );

    setTotal24h(sumCents / 100);
  }, []);

  const triggerHaptic = useCallback(
    (style: 'light' | 'medium' | 'heavy') => {
      try {
        const tg = (window as any)?.Telegram?.WebApp;

        if (tg?.HapticFeedback?.impactOccurred) {
          tg.HapticFeedback.impactOccurred(style);
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

  useEffect(() => {
    void fetchTotal();

    const channel = supabase
      .channel('tribute-live')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tributes',
        },
        (payload) => {
          const newDonation = payload.new as TributeRow;

          if (newDonation?.status === 'succeeded') {
            triggerPulse(newDonation.donor_name);
            void fetchTotal();
          }
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
    };
  }, [fetchTotal, triggerPulse]);

  const handleTribute = async () => {
    if (loading || !Number.isFinite(amount) || amount < 1) {
      return;
    }

    triggerHaptic('medium');
    setLoading(true);
    setErrorMsg(null);

    try {
      const donorName =
        typeof window !== 'undefined'
          ? localStorage.getItem('temple_user') || 'Pilgrim'
          : 'Pilgrim';

      const res = await fetch('/api/tribute/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100) / 100,
          currency: 'usd',
          donor_name: donorName,
          message: 'Fuel for the Temple',
        }),
      });

      let data: { url?: string; error?: string } = {};

      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        throw new Error(
          data.error || 'Payment gateway busy. Try again.'
        );
      }

      if (!data.url) {
        throw new Error('Payment link generation failed.');
      }

      try {
        const tg = (window as any)?.Telegram?.WebApp;

        if (tg?.openLink) {
          tg.openLink(data.url);
        } else {
          window.location.assign(data.url);
        }
      } catch {
        window.location.assign(data.url);
      }
    } catch (error) {
      console.error('Tribute checkout error:', error);

      setErrorMsg(
        error instanceof Error
          ? error.message
          : 'Connection failed.'
      );
    } finally {
      setLoading(false);
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

  return (
    <main
      className="relative flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-[#141210] font-sans text-stone-200"
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% 40%, rgba(55, 40, 32, 0.75) 0%, rgba(20, 18, 16, 1) 90%)',
      }}
    >
      <div className="noise-overlay" />

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-amber-900/40 via-orange-950/20 to-transparent blur-[120px]" />

      <TempleTopBar />

      <section className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-28 sm:px-8 sm:py-32">
        <header className="mb-7 text-center">
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

        <div className="relative mb-8 flex h-52 w-52 items-center justify-center sm:h-60 sm:w-60">
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

        <div className="w-full rounded-3xl border border-stone-800/80 bg-stone-900/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="flex gap-2.5">
            {PRESETS.map((value) => {
              const active = amount === value && !isCustom;

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setAmount(value);
                    setIsCustom(false);
                    setErrorMsg(null);
                    triggerHaptic('light');
                  }}
                  className={`h-11 flex-1 rounded-full border px-3 font-mono text-xs tracking-wider transition-all active:scale-95 ${
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
                setErrorMsg(null);
                triggerHaptic('light');
              }}
              className={`h-11 w-12 rounded-full border font-mono text-xs transition-all active:scale-95 ${
                isCustom
                  ? 'border-amber-300/60 bg-white/15 text-amber-200'
                  : 'border-white/15 bg-white/5 text-stone-400 hover:border-amber-300/40 hover:bg-white/10 hover:text-stone-200'
              }`}
              aria-label="Custom tribute amount"
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
                type="number"
                min="1"
                step="0.01"
                inputMode="decimal"
                aria-label="Custom tribute amount"
                className="mt-4 w-full rounded-xl border border-white/15 bg-white/5 p-3.5 text-center font-mono text-lg text-amber-200 outline-none transition-colors placeholder:text-stone-600 focus:border-amber-400/60 focus:bg-white/10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                placeholder="ENTER AMOUNT"
                value={amount || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const value = Number(e.target.value);

                  setAmount(
                    Number.isFinite(value)
                      ? Math.round(value * 100) / 100
                      : 0
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
            disabled={loading || !Number.isFinite(amount) || amount < 1}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-full border border-amber-300/30 bg-white/10 px-5 font-serif text-xs uppercase tracking-[0.18em] text-stone-100 shadow-md backdrop-blur-md transition-all hover:border-amber-300/60 hover:bg-white/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading
              ? 'Radiating...'
              : `Offer $${amount} for the Temple`}
          </button>

          <p className="mt-5 text-center font-mono text-[9px] uppercase leading-relaxed tracking-[0.12em] text-stone-500">
            Your tribute nourishes the Sanctuary.
            <br />
            Energy flows, expands, and illuminates all.
          </p>
        </div>
      </section>

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
    </main>
  );
}