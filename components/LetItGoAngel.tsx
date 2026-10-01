'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

const ANGEL_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0918.png';
const HEART_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png';

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

    // Удаляем улетевший сердечный элемент из DOM после завершения анимации (5 секунд)
    setTimeout(() => {
      setFlyingHearts((prev) => prev.filter((h) => h.id !== newHeartId));
    }, 5000);
  };

  return (
    <main className="relative w-full h-[100dvh] overflow-hidden bg-gradient-to-b from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF] flex flex-col items-center justify-end select-none">
      
      {/* Зеленая лужайка внизу */}
      <div className="absolute bottom-0 left-0 w-full h-[22vh] bg-gradient-to-t from-[#4A7c23] to-[#68a434] z-10 shadow-[inset_0_10px_20px_rgba(0,0,0,0.15)] pointer-events-none" />

      {/* Счётчик отпусканий в правом верхнем углу (надежно инкрементируется) */}
      <div className="absolute top-6 right-6 sm:top-10 sm:right-10 text-stone-700 font-mono text-sm sm:text-base tracking-[0.2em] z-30 bg-white/70 px-4 py-2 rounded-full backdrop-blur-md border border-white/40 shadow-md">
        ❤️ {clickCount}
      </div>

      {/* Ангел статично стоит на лужайке слева (клик по нему запускает полет сердца) */}
      <div 
        className="relative cursor-pointer transition-transform duration-300 hover:scale-[1.01] active:scale-95 z-20 flex items-center justify-center p-4 mb-[12vh] -translate-x-12 sm:-translate-x-20"
        onClick={handleClick}
        title="Click to let go"
      >
        <Image
          src={ANGEL_IMAGE}
          alt="Angel"
          width={520}
          height={520}
          className="object-contain max-w-[70vw] max-h-[60vh] drop-shadow-[0_15px_25px_rgba(0,0,0,0.15)] pointer-events-none"
          priority
        />
      </div>

      {/* Улетающее графическое сердце строго из руки ангела в небо */}
      {flyingHearts.map((heart) => (
        <div
          key={heart.id}
          className="absolute pointer-events-none z-30 flex items-center justify-center animate-fly-away"
          style={{
            width: 90,
            height: 180,
            bottom: '36%',
            left: 'calc(50% - 75px)',
          }}
        >
          <Image
            src={HEART_IMAGE}
            alt="Flying Heart"
            width={90}
            height={180}
            className="object-contain filter drop-shadow-[0_0_25px_rgba(255,80,80,0.6)]"
          />
        </div>
      ))}

      {/* Плавная CSS-анимация полета сердечка вверх */}
      <style jsx>{`
        @keyframes flyAway {
          0% {
            transform: translateY(0) scale(0.5) rotate(0deg);
            opacity: 1;
          }
          20% {
            opacity: 1;
          }
          100% {
            transform: translateY(-70vh) scale(1.2) translateX(25px) rotate(10deg);
            opacity: 0;
          }
        }

        .animate-fly-away {
          animation: flyAway 5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>
    </main>
  );
}
