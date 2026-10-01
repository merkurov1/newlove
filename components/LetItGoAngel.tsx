'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

const ANGEL_WITH_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png';
const ANGEL_WITHOUT_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0918.png';
const HEART_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0920.png';

export default function LetItGoAngel() {
  const [flyingHearts, setFlyingHearts] = useState<{ id: number }[]>([]);
  const [clickCount, setClickCount] = useState(0);
  const [showWithoutHeart, setShowWithoutHeart] = useState(false);
  const [skyGradient, setSkyGradient] = useState('bg-gradient-to-b from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF]');

  const clickCountRef = useRef(clickCount);
  clickCountRef.current = clickCount;
  const heartIdCounter = useRef(0);

  // Живое небо: определяем градиент в зависимости от реального часа суток у пользователя
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) {
      // Утро: свежие мягкие оттенки
      setSkyGradient('bg-gradient-to-b from-[#A2D2FF] via-[#BDE0FE] to-[#FFC8DD]');
    } else if (hour >= 12 && hour < 18) {
      // День: классическое небесно-голубое
      setSkyGradient('bg-gradient-to-b from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF]');
    } else if (hour >= 18 && hour < 21) {
      // Закат: персиково-розовые закатные тона
      setSkyGradient('bg-gradient-to-b from-[#FFB703] via-[#FB8500] to-[#6A0DAD]');
    } else {
      // Ночь: глубокая индиго/ночная синева
      setSkyGradient('bg-gradient-to-b from-[#0B132B] via-[#1C2541] to-[#3A506B]');
    }
  }, []);

  // Автоматическая отправка накопленного счетчика в базу temple_logs при уходе со страницы
  useEffect(() => {
    return () => {
      const count = clickCountRef.current;
      if (count > 0) {
        const payload = {
          event_type: 'ASH',
          message: `Released ${count} ${count === 1 ? 'burden' : 'burdens'} into the digital sky.`,
          author: 'Visitor'
        };

        if (navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
          navigator.sendBeacon('/api/temple_logs', blob);
        } else {
          fetch('/api/temple_logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
          }).catch(() => {});
        }
      }
    };
  }, []);

  const handleClick = () => {
    if (showWithoutHeart) return;

    const newHeartId = ++heartIdCounter.current;
    setFlyingHearts((prev) => [...prev, { id: newHeartId }]);
    setClickCount((prev) => prev + 1);

    setShowWithoutHeart(true);
    setTimeout(() => {
      setShowWithoutHeart(false);
    }, 1800);

    setTimeout(() => {
      setFlyingHearts((prev) => prev.filter((h) => h.id !== newHeartId));
    }, 6000);
  };

  return (
    <main className={`relative w-full h-[100dvh] overflow-hidden ${skyGradient} flex flex-col items-center justify-end select-none animate-fade-in transition-colors duration-1000`}>
      
      {/* Зеленая лужайка внизу */}
      <div className="absolute bottom-0 left-0 w-full h-[22vh] bg-gradient-to-t from-[#4A7c23] to-[#68a434] z-10 shadow-[inset_0_10px_20px_rgba(0,0,0,0.15)] pointer-events-none" />

      {/* Счётчик отпусканий (на мобилках опущен ниже через top-36, чтобы не налезать на шапку) */}
      <div className="absolute top-36 right-8 sm:top-28 sm:right-12 text-stone-700 font-mono text-sm sm:text-base tracking-[0.2em] z-50 bg-white/80 px-4 py-2 rounded-full backdrop-blur-md border border-white/40 shadow-md animate-fade-in">
        ❤️ {clickCount}
      </div>

      {/* Единый контейнер для ангела и сердец */}
      <div className="relative w-full max-w-3xl h-full flex items-end justify-center pb-[10vh] z-20">
        
        {/* Ангел */}
        <div 
          className={`relative transition-transform duration-200 flex items-center justify-center p-4 w-[480px] h-[480px] max-w-[65vw] max-h-[55vh] animate-fade-in ${
            showWithoutHeart ? 'cursor-default' : 'cursor-pointer active:scale-95'
          }`}
          onClick={handleClick}
          title={showWithoutHeart ? "Wait for the angel..." : "Click to let go"}
        >
          {/* Дефолтное состояние: ангел с сердцем (IMG_0919) */}
          <Image
            src={ANGEL_WITH_HEART}
            alt="Angel with heart"
            width={480}
            height={480}
            className={`absolute inset-0 w-full h-full object-contain drop-shadow-[0_15px_25px_rgba(0,0,0,0.15)] pointer-events-none transition-opacity duration-200 ${
              showWithoutHeart ? 'opacity-0' : 'opacity-100'
            }`}
            priority
          />

          {/* Состояние без сердца (IMG_0918) */}
          <Image
            src={ANGEL_WITHOUT_HEART}
            alt="Angel without heart"
            width={480}
            height={480}
            className={`absolute inset-0 w-full h-full object-contain drop-shadow-[0_15px_25px_rgba(0,0,0,0.15)] pointer-events-none transition-opacity duration-200 ${
              showWithoutHeart ? 'opacity-100' : 'opacity-0'
            }`}
            priority
          />
        </div>

        {/* Улетающие сердца */}
        {flyingHearts.map((heart) => (
          <div
            key={heart.id}
            className="absolute pointer-events-none z-30 animate-fly-away"
            style={{
              bottom: '24%',
              left: '50%',
              width: 450,
              height: 450,
              marginLeft: '-225px',
            }}
          >
            <Image
              src={HEART_IMAGE}
              alt="Flying Heart"
              width={450}
              height={450}
              className="object-contain filter drop-shadow-[0_0_25px_rgba(255,100,100,0.8)]"
            />
          </div>
        ))}
      </div>

      {/* Анимации полета и плавного появления (Fade-in) */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.98);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes flyAway {
          0% {
            transform: translateY(0) scale(0.3) rotate(0deg);
            opacity: 1;
          }
          15% {
            opacity: 1;
          }
          100% {
            transform: translateY(-80vh) scale(1.15) translateX(25px) rotate(15deg);
            opacity: 0;
          }
        }

        .animate-fade-in {
          animation: fadeIn 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .animate-fly-away {
          animation: flyAway 6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      ` }} />
    </main>
  );
}
