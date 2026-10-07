'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import html2canvas from 'html2canvas';
import { RotateCcw, Download } from 'lucide-react';

import TempleTopBar from '@/components/TempleTopBar';
import { useAuth } from '@/components/AuthContext';
import { logTempleEvent } from '@/lib/templeLogger';

const STAMP_DELAY = 1200;

const STAMP_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0947.png';

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

const roomTheme = {
  bg: 'bg-[#141210]',
  text: 'text-stone-200',
  cardBg: 'bg-stone-900/90 border-stone-800/80',
};

export default function AbsolutionClient() {
  const { user, profile } = useAuth();

  const [step, setStep] = useState<
    'confess' | 'processing' | 'receipt'
  >('confess');

  const [name, setName] = useState('');
  const [sinKey, setSinKey] =
    useState<string>('doomscroll');

  const [ticketId, setTicketId] = useState('');

  const [showStamp, setShowStamp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const receiptRef = useRef<HTMLDivElement | null>(null);

  const t = TRANSLATIONS.en;

  const sinText =
    t.sins[sinKey as keyof typeof t.sins];

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

    try {
      await logTempleEvent({
        event_type: 'ABSOLUTION',
        message: `${name} confessed: "${sinText}" and received joyous absolution.`,
        author: name,
      });
    } catch (error) {
      console.error(
        'Failed to log absolution to temple:',
        error
      );
    }

    window.setTimeout(() => {
      setStep('receipt');

      triggerHaptic('medium');

      window.setTimeout(() => {
        setShowStamp(true);
        triggerHaptic('heavy');
      }, STAMP_DELAY);
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
      const canvas = await html2canvas(element, {
        scale:
          typeof window !== 'undefined' &&
          window.devicePixelRatio > 1
            ? 2
            : 2,

        backgroundColor: '#ffffff',

        logging: false,

        useCORS: true,

        allowTaint: false,
      });

      const image = canvas.toDataURL(
        'image/png',
        1
      );

      const tg =
        (window as any).Telegram?.WebApp;

      if (tg?.showPopup) {
        tg.showPopup({
          title: 'Saved',
          message:
            'Long press the image to save it to your gallery.',
          buttons: [
            {
              type: 'ok',
            },
          ],
        });

        return;
      }

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
    setStep('confess');
    setShowStamp(false);
    setIsSaving(false);
  };

  return (
    <main
      className={`relative flex min-h-[100dvh] w-full flex-col overflow-x-hidden ${roomTheme.bg} ${roomTheme.text} font-sans`}
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% 40%, rgba(55, 40, 32, 0.75) 0%, rgba(20, 18, 16, 1) 90%)',
      }}
    >
      <div className="noise-overlay" />

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-amber-900/40 via-orange-950/20 to-transparent blur-[120px]" />

      <TempleTopBar />

      <section className="relative z-20 mx-auto flex min-h-[100dvh] w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-28 sm:px-8 sm:py-32">
        {step === 'confess' && (
          <div
            className={`w-full space-y-7 rounded-3xl border ${roomTheme.cardBg} p-6 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in duration-500 sm:p-8`}
          >
            <div className="space-y-3 text-center">
              <div>
                <h1 className="text-xl font-semibold tracking-[0.28em] text-stone-100 sm:text-2xl">
                  {t.title}
                </h1>

                <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-stone-400">
                  {t.subtitle}
                </p>
              </div>
            </div>

            <div className="h-px w-full bg-white/10" />

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="block font-mono text-[10px] uppercase tracking-[0.22em] text-stone-400">
                  Your Burden to Release
                </label>

                <select
                  value={sinKey}
                  onChange={(e) =>
                    setSinKey(e.target.value)
                  }
                  className="w-full rounded-xl border border-white/15 bg-white/5 p-3.5 text-xs uppercase tracking-wider text-stone-200 outline-none transition-colors focus:border-amber-400/60 focus:bg-white/10"
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
                <label className="block font-mono text-[10px] uppercase tracking-[0.22em] text-stone-400">
                  Pilgrim Identity
                </label>

                <input
                  type="text"
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value)
                  }
                  placeholder={t.placeholder}
                  maxLength={120}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-xs uppercase tracking-wider text-stone-200 outline-none transition-colors placeholder:text-stone-600 focus:border-amber-400/60 focus:bg-white/10"
                />
              </div>

              <button
                onClick={() => void handleConfess()}
                disabled={!name.trim()}
                className="group relative flex h-12 w-full items-center justify-center gap-2 rounded-full border border-amber-300/30 bg-white/10 px-5 font-serif text-xs uppercase tracking-[0.18em] text-stone-100 shadow-md backdrop-blur-md transition-all hover:border-amber-300/60 hover:bg-white/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t.btn}
              </button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div
            className={`w-full max-w-sm space-y-5 rounded-3xl border ${roomTheme.cardBg} p-10 text-center shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in duration-500`}
          >
            <div className="text-2xl text-amber-300 animate-pulse">
              · · ·
            </div>

            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-400">
              Dissolving burdens into light...
            </div>
          </div>
        )}

        {step === 'receipt' && (
          <div className="flex w-full flex-col items-center gap-6 animate-in slide-in-from-bottom-6 duration-700">
            <div
              ref={receiptRef}
              className="relative w-[320px] rotate-1 rounded-2xl border border-stone-200 bg-white p-8 font-mono text-stone-900 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
            >
              <div className="mb-4 border-b border-dashed border-stone-900 pb-4 text-center">
                <h2 className="text-base font-black tracking-widest text-stone-900">
                  {t.receipt.header}
                </h2>

                <p className="mt-1 text-[9px] uppercase text-stone-500">
                  {new Date().toLocaleString()}
                </p>

                <p className="text-[9px] uppercase text-stone-500">
                  ID: {ticketId}
                </p>
              </div>

              <div className="mb-6 space-y-3 text-xs">
                <div className="flex justify-between border-b border-stone-100 pb-2">
                  <span className="text-stone-400">
                    PILGRIM:
                  </span>

                  <span className="max-w-[170px] truncate font-bold uppercase text-stone-900">
                    {name}
                  </span>
                </div>

                <div className="flex flex-col border-b border-stone-100 pb-2">
                  <span className="mb-1 text-stone-400">
                    RELEASED BURDEN:
                  </span>

                  <span className="font-bold uppercase leading-tight text-emerald-600">
                    {sinText}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-stone-400">
                    KARMA BALANCE:
                  </span>

                  <span className="text-sm font-bold text-amber-600">
                    ✨ PURE
                  </span>
                </div>
              </div>

              <div className="border-t border-dashed border-stone-900 pt-4 text-center">
                <p className="mb-2 text-[9px] italic text-stone-600">
                  "{t.receipt.footer}"
                </p>

                <p className="font-serif text-xs italic text-stone-700">
                  {t.receipt.signature}
                </p>
              </div>

              <div
                className={`pointer-events-none absolute left-1/2 top-1/2 select-none -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] transition-all duration-700 ${
                  showStamp
                    ? 'scale-100 opacity-95'
                    : 'scale-150 opacity-0'
                }`}
              >
                <Image
                  src={STAMP_IMAGE}
                  alt="Absolution Stamp"
                  width={210}
                  height={210}
                  className="object-contain drop-shadow-[0_5px_15px_rgba(225,29,72,0.3)] filter contrast-125"
                />
              </div>
            </div>

            <div className="flex w-full gap-3">
              <button
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-amber-300/30 bg-white/10 px-4 font-serif text-xs uppercase tracking-[0.15em] text-stone-100 shadow-md backdrop-blur-md transition-all hover:border-amber-300/60 hover:bg-white/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download
                  size={14}
                  className="text-amber-400"
                />

                <span>
                  {isSaving
                    ? 'SAVING...'
                    : t.save}
                </span>
              </button>

              <button
                onClick={handleNewAbsolution}
                aria-label={t.newConfession}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-stone-300 transition-all hover:border-amber-300/50 hover:bg-white/10 hover:text-amber-200 active:scale-95"
              >
                <RotateCcw size={15} />
              </button>
            </div>
          </div>
        )}
      </section>

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
    </main>
  );
}