'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

const ANGEL_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0918.png';
const HEART_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0920.png';

export default function LetItGoAngel() {
  const [flyingHearts, setFlyingHearts] = useState<{ id: number }[]>([]);
  const [clickCount, setClickCount] = useState(0);

  const clickCountRef = useRef(clickCount);
  clickCountRef.current = clickCount;

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
    const newHeartId = Date.now();
    setFlyingHearts((prev) => [...prev, { id: newHeartId }]);
    setClickCount((prev) => prev + 1);

    // Удаляем улетевшее сердечко из DOM после завершения анимации (4 секунды)
    setTimeout(() => {
      setFlyingHearts((prev) => prev.filter((h) => h.id !== newHeartId));
    }, 4000);
  };

  return (
    <main className="relative w-full h-[100dvh] overflow-hidden bg-gradient-to-b from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF] flex flex-col items-center justify-end select-none">
      
      {/* Зеленая лужайка внизу */}
      <div className="absolute bottom-0 left-0 w-full h-[22vh] bg-gradient-to-t from-[#4A7c23] to-[#68a434] z-10 shadow-[inset_0_10px_20px_rgba(0,0,0,0.15)] pointer-events-none" />

      {/* Счётчик отпусканий в правом верхнем углу */}
      <div className="absolute top-6 right-6 sm:top-10 sm:right-10 text-stone-700 font-mono text-sm sm:text-base tracking-[0.2em] z-50 bg-white/80 px-4 py-2 rounded-full backdrop-blur-md border border-white/40 shadow-md">
        ❤️ {clickCount}
      </div>

      {/* Единый контейнер для ангела и сердец */}
      <div className="relative w-full max-w-3xl h-full flex items-end justify-center pb-[10vh] z-20">
        
        {/* Статичный ангел (клик запускает полет отдельного сердца) */}
        <div 
          className="relative cursor-pointer transition-transform duration-200 active:scale-95 flex items-center justify-center p-4"
          onClick={handleClick}
          title="Click to let go"
        >
          <Image
            src={ANGEL_IMAGE}
            alt="Angel"
            width={480}
            height={480}
            className="object-contain max-w-[65vw] max-h-[55vh] drop-shadow-[0_15px_25px_rgba(0,0,0,0.15)] pointer-events-none"
            priority
          />
        </div>

        {/* Улетающее отдельно сердечко (IMG_0920.png) */}
        {flyingHearts.map((heart) => (
          <div
            key={heart.id}
            className="absolute pointer-events-none z-30 animate-fly-away"
            style={{
              bottom: '42%',
              left: '50%',
              width: 50,
              height: 50,
              marginLeft: '-25px',
            }}
          >
            <Image
              src={HEART_IMAGE}
              alt="Flying Heart"
              width={50}
              height={50}
              className="object-contain filter drop-shadow-[0_0_20px_rgba(255,100,100,0.8)]"
            />
          </div>
        ))}
      </div>

      {/* Чистая CSS-анимация полета сердечка вверх */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes flyAway {
          0% {
            transform: translateY(0) scale(0.6) rotate(0deg);
            opacity: 1;
          }
          20% {
            opacity: 1;
          }
          100% {
            transform: translateY(-60vh) scale(1.4) translateX(15px) rotate(12deg);
            opacity: 0;
          }
        }

        .animate-fly-away {
          animation: flyAway 4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      ` }} />
    </main>
  );
}
