'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAuth } from '@/components/AuthContext';
import useTempleIdentity from '@/hooks/useTempleIdentity';
import TempleTopBar from './TempleTopBar';
import { useRitualModalTimer } from './temple/useRitualModalTimer';
import { logTempleEvent } from '@/lib/templeLogger';

const ANGEL_WITH_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png';
const ANGEL_WITHOUT_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0918.png';
const HEART_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0920.png';

type TelegramWebApp = {
  expand?: () => void;
};

export default function LetItGoAngel() {
  const { user, profile } = useAuth();
  const identity = useTempleIdentity();
  const [flyingHearts, setFlyingHearts] = useState<{ id: number }[]>([]);
  const [clickCount, setClickCount] = useState(0);
  const [showWithoutHeart, setShowWithoutHeart] = useState(false);
  const [skyGradient, setSkyGradient] = useState('bg-gradient-to-b from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF]');

  const currentAuthorName = identity.displayName || profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || (typeof window !== 'undefined' ? localStorage.getItem('temple_user') : null) || 'Visitor';

  const clickCountRef = useRef(clickCount);
  clickCountRef.current = clickCount;
  const authorRef = useRef(currentAuthorName);
  authorRef.current = currentAuthorName;

  const heartIdCounter = useRef(0);
  const showWithoutHeartTimeoutRef = useRef<number | null>(null);
  const heartTimeoutsRef = useRef(new Map<number, number>());

  // Инициализация Telegram WebApp (разворачивание на весь экран)
  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } })
      .Telegram?.WebApp;

    try {
      tg?.expand?.();
    } catch {
      // Telegram expansion is optional.
    }
  }, []);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) {
      setSkyGradient('bg-gradient-to-b from-[#A2D2FF] via-[#BDE0FE] to-[#FFC8DD]');
    } else if (hour >= 12 && hour < 18) {
      setSkyGradient('bg-gradient-to-b from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF]');
    } else if (hour >= 18 && hour < 21) {
      setSkyGradient('bg-gradient-to-b from-[#FFB703] via-[#FB8500] to-[#6A0DAD]');
    } else {
      setSkyGradient('bg-gradient-to-b from-[#0B132B] via-[#1C2541] to-[#3A506B]');
    }
  }, []);

  useEffect(() => {
    return () => {
      const count = clickCountRef.current;
      if (count > 0) {
        void logTempleEvent({
          event_type: 'ASH',
          message: `Released ${count}${count === 1 ? ' burden' : ' burdens'} into the digital sky.`,
          author: authorRef.current
        });
      }
    };
  }, []);

  useEffect(() => {
    const heartTimeouts = heartTimeoutsRef.current;

    return () => {
      if (showWithoutHeartTimeoutRef.current !== null) {
        window.clearTimeout(showWithoutHeartTimeoutRef.current);
        showWithoutHeartTimeoutRef.current = null;
      }

      for (const timeoutId of heartTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }

      heartTimeouts.clear();
    };
  }, []);

  /*
   * The shared modal header owns the only visible counter while this ritual is
   * open over the Temple. On the canonical full page the modal is absent and
   * TempleTopBar renders the same counter, so it is never shown twice.
   */
  useRitualModalTimer(`❤️ ${clickCount}`);

  const handleClick = () => {
    if (showWithoutHeart) return;

    const newHeartId = ++heartIdCounter.current;
    setFlyingHearts((prev) => [...prev, { id: newHeartId }]);
    setClickCount((prev) => prev + 1);

    setShowWithoutHeart(true);

    if (showWithoutHeartTimeoutRef.current !== null) {
      window.clearTimeout(showWithoutHeartTimeoutRef.current);
    }

    showWithoutHeartTimeoutRef.current = window.setTimeout(() => {
      setShowWithoutHeart(false);
      showWithoutHeartTimeoutRef.current = null;
    }, 1800);

    const removeTimeout = window.setTimeout(() => {
      setFlyingHearts((prev) => prev.filter((h) => h.id !== newHeartId));
      heartTimeoutsRef.current.delete(newHeartId);
    }, 6000);

    heartTimeoutsRef.current.set(newHeartId, removeTimeout);
  };

  return (
    <div
      className={`ritual-scene ritual-scene--letitgo relative flex h-full min-h-0 w-full flex-col overflow-hidden ${skyGradient} select-none p-3 sm:p-6 animate-fade-in transition-colors duration-1000`}
    >
      <section className="sr-only" aria-labelledby="release-ritual-title">
        <h1 id="release-ritual-title">Let It Go — Heart &amp; Angel ritual</h1>
        <p>Release a burden into the sky and make room for lightness in the digital sanctuary.</p>
      </section>

      {/* Announced in both presentations; the visible counter lives in exactly
          one place (modal header or TempleTopBar). */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {clickCount === 1
          ? '1 heart released'
          : `${clickCount} hearts released`}
      </p>

      <TempleTopBar
        backTo="world"
        right={
          <span
            className="rounded-full border border-amber-300/20 bg-black/40 px-3 py-2 text-[10px] uppercase tracking-[.14em] text-amber-100"
            aria-hidden="true"
          >
            ❤️ {clickCount}
          </span>
        }
      />

      <div
        className="pointer-events-none absolute bottom-0 left-0 z-10 w-full bg-gradient-to-t from-[#4A7c23] to-[#68a434] shadow-[inset_0_10px_20px_rgba(0,0,0,0.15)]"
        style={{ height: '22cqh' }}
      />

      <div
        className="relative z-20 flex w-full flex-1 items-end justify-center"
        style={{
          paddingTop: 'clamp(0.75rem, 10cqh, 4rem)',
          paddingBottom: 'clamp(0.5rem, 8cqh, 3rem)',
        }}
      >
        <button
          type="button"
          onClick={handleClick}
          disabled={showWithoutHeart}
          aria-label={
            showWithoutHeart
              ? 'Angel is releasing the heart. Please wait.'
              : 'Release a burden with the angel'
          }
          title={showWithoutHeart ? "Wait for the angel..." : "Click to let go"}
          className={`relative flex items-center justify-center p-4 transition-transform duration-200 animate-fade-in ${
            showWithoutHeart
              ? 'cursor-default'
              : 'cursor-pointer active:scale-95'
          }`}
          style={{
            width: 'min(480px, 70cqw, 60cqh)',
            height: 'min(480px, 70cqw, 60cqh)',
          }}
        >
          <Image
            src={ANGEL_WITH_HEART}
            alt=""
            width={480}
            height={480}
            className={`absolute inset-0 w-full h-full object-contain drop-shadow-[0_15px_25px_rgba(0,0,0,0.15)] pointer-events-none transition-opacity duration-200 ${
              showWithoutHeart ? 'opacity-0' : 'opacity-100'
            }`}
            priority
          />

          <Image
            src={ANGEL_WITHOUT_HEART}
            alt=""
            width={480}
            height={480}
            className={`absolute inset-0 w-full h-full object-contain drop-shadow-[0_15px_25px_rgba(0,0,0,0.15)] pointer-events-none transition-opacity duration-200 ${
              showWithoutHeart ? 'opacity-100' : 'opacity-0'
            }`}
            priority
          />
        </button>

        {flyingHearts.map((heart) => (
          <div
            key={heart.id}
            className="absolute pointer-events-none z-30"
            style={{
              bottom: '24%',
              left: '50%',
              width: 'min(450px, 70cqw, 60cqh)',
              height: 'min(450px, 70cqw, 60cqh)',
              transform: 'translateX(-50%)',
            }}
          >
            <div className="relative h-full w-full animate-fly-away">
              <Image
                src={HEART_IMAGE}
                alt=""
                fill
                sizes="(max-width: 640px) 70vw, 450px"
                className="object-contain filter drop-shadow-[0_0_25px_rgba(255,100,100,0.8)]"
              />
            </div>
          </div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes flyAway {
          0% { transform: translateY(0) scale(0.3) rotate(0deg); opacity: 1; }
          15% { opacity: 1; }
          100% { transform: translateY(-92cqh) scale(1.15) translateX(25px) rotate(15deg); opacity: 0; }
        }
        .animate-fade-in { animation: fadeIn 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fly-away { animation: flyAway 6s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .ritual-scene--letitgo .animate-fade-in,
          .ritual-scene--letitgo .animate-fly-away {
            animation: none !important;
          }
          .ritual-scene--letitgo .animate-fly-away {
            opacity: 0;
          }
        }
      ` }} />
    </div>
  );
}
