'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { RotateCcw, Download } from 'lucide-react';

import TempleTopBar from '@/components/TempleTopBar';
import { useAuth } from '@/components/AuthContext';
import { logTempleEvent } from '@/lib/templeLogger';

const STAMP_DELAY = 1200;

const STAMP_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0947.png';

const HEART_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png';

const TRANSLATIONS = {
  en: {
    title: 'ONLINE ABSOLUTION',

    subtitle:
      'Your digital burden is lifted. Lightness restored.',

    placeholder: 'Your Name / Pilgrim',

    sins: {
      doomscroll: 'Doomscrolling past 3 AM',
      envy: "Envy: Stalking others' success",
      crypto: 'Greed: Checking portfolio x100/day',
      ai: 'Sloth: Using AI to write love letters',
      vanity: 'Vanity: Googling my own name',
      wrath: 'Wrath: Internet arguments',
      lust: 'Lust: Digital voyeurism',
    },

    receipt: {
      header: 'SANCTUARY OF LIGHT',
      footer: 'Pure energy. Absolute freedom.',
      signature: 'Pierrot, AI Chaplain',
    },

    btn: 'RECEIVE ABSOLUTION',
    save: 'SAVE CERTIFICATE',
    newConfession: 'NEW ABSOLUTION',
  },
};

export type AbsolutionVariant = 'page' | 'modal';

export default function AbsolutionClient({
  variant = 'page',
}: {
  variant?: AbsolutionVariant;
}) {
  const { user, profile } = useAuth();
  const isModal = variant === 'modal';

  const [step, setStep] = useState<
    'confess' | 'processing' | 'receipt'
  >('confess');

  const [name, setName] = useState('');
  const [sinKey, setSinKey] =
    useState<string>('doomscroll');

  const [ticketId, setTicketId] = useState('');

  const [showStamp, setShowStamp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [traceStatus, setTraceStatus] = useState<'idle' | 'saved' | 'failed'>('idle');

  const receiptRef = useRef<HTMLDivElement | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const stampTimerRef = useRef<number | null>(null);
  const activeRef = useRef(true);

  const t = TRANSLATIONS.en;

  const sinText =
    t.sins[sinKey as keyof typeof t.sins];

  useEffect(() => {
    activeRef.current = true;

    return () => {
      activeRef.current = false;
    };
  }, []);

  useEffect(() => {
    setTicketId(
      `#${Math.random()
        .toString(36)
        .substring(2, 9)
        .toUpperCase()}`
    );

    const tg = (window as any).Telegram?.WebApp;

    if (tg) {
      try {
        tg.expand?.();
      } catch {}

      const telegramName =
        tg.initDataUnsafe?.user?.username ||
        tg.initDataUnsafe?.user?.first_name;

      const resolved =
        telegramName ||
        profile?.name ||
        profile?.full_name ||
        user?.user_metadata?.name ||
        user?.email?.split('@')[0] ||
        localStorage.getItem('temple_user') ||
        'Pilgrim';

      setName(
        telegramName
          ? `@${telegramName}`
          : resolved
      );

      localStorage.setItem(
        'temple_user',
        resolved
      );
    } else {
      setName(
        profile?.name ||
          profile?.full_name ||
          user?.user_metadata?.name ||
          user?.email?.split('@')[0] ||
          localStorage.getItem('temple_user') ||
          'Pilgrim'
      );
    }
  }, [profile, user]);

  useEffect(() => () => {
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    if (stampTimerRef.current !== null) window.clearTimeout(stampTimerRef.current);
  }, []);

  const triggerHaptic = (
    style:
      | 'light'
      | 'medium'
      | 'heavy'
      | 'error'
  ) => {
    const tg = (window as any).Telegram?.WebApp;

    try {
      if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred(style);
      }
    } catch {}
  };

  const handleConfess = async () => {
    if (!name.trim()) {
      triggerHaptic('error');
      return;
    }

    triggerHaptic('heavy');

    setStep('processing');
    setTraceStatus('idle');

    // The ceremony is not conditioned on database availability. The trace is
    // reported separately and only ever claims persistence after the write
    // actually succeeded.
    void logTempleEvent({
      event_type: 'ABSOLUTION',
      message: `${name} confessed: "${sinText}" and received joyous absolution.`,
      author: name,
    }).then((persisted) => {
      if (activeRef.current) {
        setTraceStatus(persisted ? 'saved' : 'failed');
      }
    });

    completionTimerRef.current = window.setTimeout(() => {
      setStep('receipt');

      triggerHaptic('medium');

      stampTimerRef.current = window.setTimeout(() => {
        setShowStamp(true);
        triggerHaptic('heavy');
        stampTimerRef.current = null;
      }, STAMP_DELAY);
      completionTimerRef.current = null;
    }, 2000);
  };

  const handleSave = async () => {
    const element = receiptRef.current;

    if (!element || isSaving) {
      return;
    }

    triggerHaptic('light');

    setIsSaving(true);

    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#f8f2e6',
        logging: false,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 15000,
      });

      const image = canvas.toDataURL(
        'image/png',
        1
      );

      const link =
        document.createElement('a');

      link.download = `Sanctuary_Absolution_${ticketId}.png`;
      link.href = image;

      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error(
        'Failed to save absolution certificate:',
        error
      );

      const tg =
        (window as any).Telegram?.WebApp;

      try {
        tg?.showPopup?.({
          title: 'Unable to save',
          message:
            'The certificate could not be rendered. Please try again.',
          buttons: [
            {
              type: 'ok',
            },
          ],
        });
      } catch {}
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewAbsolution = () => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    if (stampTimerRef.current !== null) {
      window.clearTimeout(stampTimerRef.current);
      stampTimerRef.current = null;
    }

    setStep('confess');
    setShowStamp(false);
    setIsSaving(false);
    setTraceStatus('idle');
  };

  return (
    <div
      className={`absolution-page ${
        isModal ? 'absolution-page--modal' : 'min-h-[100dvh]'
      } relative flex w-full flex-col overflow-x-hidden bg-[#141210] text-stone-200 font-sans`}
      data-absolution-variant={variant}
      style={{
        backgroundImage: isModal
          ? 'radial-gradient(circle at 50% 22%, rgba(85, 58, 38, 0.45) 0%, rgba(20, 18, 16, 0.96) 72%)'
          : 'radial-gradient(circle at 50% 40%, rgba(55, 40, 32, 0.75) 0%, rgba(20, 18, 16, 1) 90%)',
      }}
    >
      {!isModal && <div className="noise-overlay" />}

      <div
        className={`pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-amber-900/40 via-orange-950/20 to-transparent blur-[120px] ${
          isModal ? 'h-[380px] w-[380px]' : 'h-[600px] w-[600px]'
        }`}
      />

      {!isModal && <TempleTopBar backTo="temple" />}

      <section
        className={`absolution-stage relative z-20 mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center ${
          isModal
            ? 'absolution-stage--modal px-0 py-1'
            : 'px-6 py-28 sm:px-8 sm:py-32'
        }`}
      >
        {step === 'confess' && (
          <div className="absolution-card w-full space-y-4 rounded-[1.5rem] border border-amber-300/25 bg-stone-950/75 p-4 text-stone-200 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:space-y-6 sm:rounded-[1.75rem] sm:p-7">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-2.5 flex h-14 w-14 items-center justify-center sm:mb-3 sm:h-16 sm:w-16">
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-amber-400/20 blur-xl"
                />

                <Image
                  data-testid="absolution-heart"
                  src={HEART_IMAGE}
                  alt="Temple heart"
                  width={96}
                  height={96}
                  crossOrigin="anonymous"
                  className="relative h-12 w-12 object-contain brightness-110 drop-shadow-[0_0_18px_rgba(245,198,110,0.4)] sm:h-14 sm:w-14"
                />
              </div>

              <p className="font-mono text-[9px] uppercase tracking-[0.32em] text-amber-200/70">
                Ritual of release
              </p>

              <h1 className="mt-2 font-serif text-xl tracking-[0.14em] text-stone-50 sm:text-3xl sm:tracking-[0.18em]">
                {t.title}
              </h1>

              <p className="mt-2 max-w-[19rem] text-[9px] uppercase leading-relaxed tracking-[0.16em] text-stone-400 sm:text-[10px] sm:tracking-[0.18em]">
                {t.subtitle}
              </p>
            </div>

            <div
              aria-hidden="true"
              className="flex items-center gap-3 text-amber-200/30"
            >
              <span className="h-px flex-1 bg-current" />
              <span className="text-[8px]">✦</span>
              <span className="h-px flex-1 bg-current" />
            </div>

            <div className="space-y-4 sm:space-y-5">
              <div className="space-y-2">
                <label
                  htmlFor="absolution-burden"
                  className="block font-mono text-[10px] uppercase tracking-[0.22em] text-stone-400"
                >
                  Your Burden to Release
                </label>

                <select
                  id="absolution-burden"
                  value={sinKey}
                  onChange={(e) =>
                    setSinKey(e.target.value)
                  }
                  className="w-full rounded-xl border border-white/15 bg-white/5 p-3 text-xs uppercase tracking-wider text-stone-200 outline-none transition-colors focus:border-amber-400/60 focus:bg-white/10 sm:p-3.5"
                >
                  {Object.entries(t.sins).map(
                    ([key, value]) => (
                      <option
                        key={key}
                        value={key}
                        className="bg-[#141210] text-stone-200"
                      >
                        {value}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="absolution-pilgrim"
                  className="block font-mono text-[10px] uppercase tracking-[0.22em] text-stone-400"
                >
                  Pilgrim Identity
                </label>

                <input
                  id="absolution-pilgrim"
                  type="text"
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value)
                  }
                  placeholder={t.placeholder}
                  maxLength={120}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs uppercase tracking-wider text-stone-200 outline-none transition-colors placeholder:text-stone-600 focus:border-amber-400/60 focus:bg-white/10 sm:py-3.5"
                />
              </div>

              <button
                type="button"
                onClick={() => void handleConfess()}
                disabled={!name.trim()}
                className="group relative flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/15 px-5 py-3 font-serif text-xs uppercase tracking-[0.18em] text-amber-50 shadow-md backdrop-blur-md transition-all hover:border-amber-300/70 hover:bg-amber-300/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[48px]"
              >
                {t.btn}
              </button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="absolution-card w-full max-w-sm space-y-5 rounded-[1.75rem] border border-amber-300/25 bg-stone-950/75 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
              <span
                aria-hidden="true"
                className="absolute inset-0 animate-ping rounded-full bg-amber-300/15"
              />

              <Image
                data-testid="absolution-heart"
                src={HEART_IMAGE}
                alt="Temple heart"
                width={96}
                height={96}
                crossOrigin="anonymous"
                className="relative h-12 w-12 animate-pulse object-contain brightness-110 drop-shadow-[0_0_18px_rgba(245,198,110,0.4)]"
              />
            </div>

            <div
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-400"
              role="status"
            >
              Dissolving burdens into light...
            </div>
          </div>
        )}

        {step === 'receipt' && (
          <div className="flex w-full flex-col items-center gap-4">
            <p
              className={`text-center font-mono text-[10px] uppercase tracking-[.14em] ${
                traceStatus === 'saved'
                  ? 'text-emerald-300'
                  : 'text-amber-300'
              }`}
              role="status"
            >
              {traceStatus === 'saved'
                ? 'Ceremony complete · Temple trace recorded'
                : traceStatus === 'failed'
                  ? 'Ceremony complete · trace could not be recorded'
                  : 'Ceremony complete · recording trace…'}
            </p>

            <div
              ref={receiptRef}
              data-testid="absolution-certificate"
              className="absolution-certificate relative isolate w-full max-w-[340px] overflow-hidden rounded-[1.35rem] border border-[#c8a96b]/70 bg-[#f8f2e6] px-5 py-6 font-mono text-stone-900 shadow-[0_24px_70px_rgba(0,0,0,0.5)]"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-[6px] rounded-[1.05rem] border border-[#b08a4a]/25"
              />

              <div className="relative z-10 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-[#c8a96b]/50 bg-[#fff8ea] shadow-[0_0_22px_rgba(200,169,107,0.35)]">
                  <Image
                    data-testid="absolution-certificate-heart"
                    src={HEART_IMAGE}
                    alt=""
                    width={64}
                    height={64}
                    crossOrigin="anonymous"
                    className="h-7 w-7 object-contain brightness-110"
                  />
                </div>

                <p className="text-[8px] uppercase tracking-[0.28em] text-stone-500">
                  Digital Temple · Certificate
                </p>

                <h2 className="mt-1 font-serif text-lg font-semibold tracking-[0.16em] text-stone-900">
                  {t.receipt.header}
                </h2>

                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[8px] uppercase tracking-[0.12em] text-stone-500">
                  <span>{new Date().toLocaleDateString()}</span>
                  <span aria-hidden="true">·</span>
                  <span>ID: {ticketId}</span>
                </div>
              </div>

              <div className="relative z-10 my-4 h-px bg-[#b08a4a]/35">
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#f8f2e6] px-2 text-[8px] text-[#9a7438]">
                  ✦
                </span>
              </div>

              <dl className="relative z-10 space-y-3">
                <div>
                  <dt className="text-[8px] uppercase tracking-[0.22em] text-stone-500">
                    Pilgrim
                  </dt>
                  <dd className="truncate font-serif text-sm font-semibold uppercase tracking-wide text-stone-900">
                    {name}
                  </dd>
                </div>

                <div>
                  <dt className="text-[8px] uppercase tracking-[0.22em] text-stone-500">
                    Released burden
                  </dt>
                  <dd className="font-serif text-sm font-semibold uppercase leading-tight text-emerald-700">
                    {sinText}
                  </dd>
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div>
                    <dt className="text-[8px] uppercase tracking-[0.22em] text-stone-500">
                      Karma balance
                    </dt>
                    <dd className="font-serif text-sm font-semibold uppercase tracking-wide text-[#9a7438]">
                      ✨ Pure
                    </dd>
                  </div>

                  <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-stone-400">
                    Absolved
                  </span>
                </div>
              </dl>

              <div className="relative z-10 mt-5 border-t border-dashed border-[#b08a4a]/40 pt-3 text-center">
                <p className="font-serif text-[11px] italic text-stone-600">
                  &ldquo;{t.receipt.footer}&rdquo;
                </p>

                <p className="mt-1 font-serif text-xs italic text-stone-700">
                  {t.receipt.signature}
                </p>
              </div>

              <div
                data-testid="absolution-stamp"
                data-visible={showStamp ? 'true' : 'false'}
                className={`pointer-events-none absolute left-1/2 top-[56%] z-0 select-none -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] transition-all duration-700 ${
                  showStamp
                    ? 'scale-100 opacity-95'
                    : 'scale-125 opacity-0'
                }`}
              >
                <Image
                  data-testid="absolution-stamp-image"
                  src={STAMP_IMAGE}
                  alt="Absolution Stamp"
                  width={480}
                  height={480}
                  crossOrigin="anonymous"
                  className="h-auto w-[240px] object-contain brightness-110 contrast-125 saturate-110 drop-shadow-[0_5px_18px_rgba(225,29,72,0.35)]"
                />
              </div>
            </div>

            <div className="flex w-full max-w-[340px] gap-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving || !showStamp}
                className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/15 px-4 py-2.5 font-serif text-xs uppercase tracking-[0.15em] text-amber-50 shadow-md backdrop-blur-md transition-all hover:border-amber-300/70 hover:bg-amber-300/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download
                  size={14}
                  className="text-amber-300"
                  aria-hidden="true"
                />

                <span>
                  {isSaving
                    ? 'SAVING...'
                    : t.save}
                </span>
              </button>

              <button
                type="button"
                onClick={handleNewAbsolution}
                aria-label={t.newConfession}
                className="flex min-h-[48px] w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-stone-300 transition-all hover:border-amber-300/50 hover:bg-white/10 hover:text-amber-200 active:scale-95"
              >
                <RotateCcw size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>

      {!isModal && (
        <style jsx global>{`
          .noise-overlay {
            position: fixed;
            inset: 0;
            pointer-events: none;
            opacity: 0.04;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' fill='white'/%3E%3C/svg%3E");
            z-index: 1;
          }
        `}</style>
      )}
    </div>
  );
}
