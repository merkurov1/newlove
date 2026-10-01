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

  const clickCountRef = useRef(clickCount);
  clickCountRef.current = clickCount;
  const heartIdCounter = useRef(0);

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
    // Если ангел еще без сердца — игнорируем клик
    if (showWithoutHeart) return;

    const newHeartId = ++heartIdCounter.current;
    setFlyingHearts((prev) => [...prev, { id: newHeartId }]);
    setClickCount((prev) => prev + 1);

    // Ангел остается без сердца 1.8 секунды, после чего возвращает его (готов к новому клику)
    setShowWithoutHeart(true);
    setTimeout(() => {
      setShowWithoutHeart(false);
    }, 1800);

    // Само улетающее сердце продолжает лететь полный цикл анимации (6 секунд)
    setTimeout(() => {
      setFlyingHearts((prev) => prev.filter((h) => h.id !== newHeartId));
    }, 6000);
  };

  return (
    <main className="relative w-full h-[100dvh] overflow-hidden bg-gradient-to-b from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF] flex flex-col items-center justify-end select-none">
      
      {/* Зеленая лужайка внизу */}
      <div className="absolute bottom-0 left-0 w-full h-[22vh] bg-gradient-to-t from-[#4A7c23] to-[#68a434] z-10 shadow-[inset_0_10px_20px_rgba(0,0,0,0.15)] pointer-events-none" />

      {/* Счётчик отпусканий */}
      <div className="absolute top-24 right-8 sm:top-28 sm:right-12 text-stone-700 font-mono text-sm sm:text-base tracking-[0.2em] z-50 bg-white/80 px-4 py-2 rounded-full backdrop-blur-md border border-white/40 shadow-md">
        ❤️ {clickCount}
      </div>

      {/* Единый контейнер для ангела и сердец */}
      <div className="relative w-full max-w-3xl h-full flex items-end justify-center pb-[10vh] z-20">
        
        {/* Ангел (при клике меняет курсор/активность, если заблокирован) */}
        <div 
          className={`relative transition-transform duration-200 flex items-center justify-center p-4 w-[480px] h-[480px] max-w-[65vw] max-h-[55vh] ${
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

        {/* Улетающее сердце (крупное 450px, старт из нижней точки рук) */}
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

      {/* CSS-анимация плавного полета сердечка вверх (6 секунд) */}
      <style dangerouslySetInnerHTML={{ __html: `
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

        .animate-fly-away {
          animation: flyAway 6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      ` }} />
    </main>
  );
}
