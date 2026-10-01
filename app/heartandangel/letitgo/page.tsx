'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

const ANGEL_WITH_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png';
const ANGEL_WITHOUT_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0918.png';

export default function LetItGoPage() {
  const [isLettingGo, setIsLettingGo] = useState(false);
  const [hearts, setHearts] = useState<{ id: number }[]>([]);
  const [clickCount, setClickCount] = useState(0);

  const clickCountRef = useRef(clickCount);
  clickCountRef.current = clickCount;

  // Автоматическая отправка накопленного счетчика в базу при закрытии или уходе со страницы
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
    if (isLettingGo) return;

    setIsLettingGo(true);
    const newHeartId = Date.now();
    setHearts((prev) => [...prev, { id: newHeartId }]);
    setClickCount((prev) => prev + 1);

    // Возвращаем сердце ангелу через 5 секунд
    setTimeout(() => {
      setIsLettingGo(false);
    }, 5000);

    // Удаляем улетевший элемент из DOM
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h.id !== newHeartId));
    }, 5000);
  };

  return (
    <main className="relative w-full h-[100dvh] overflow-hidden bg-gradient-to-b from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF] flex flex-col items-center justify-center select-none">
      
      {/* Зеленая лужайка внизу */}
      <div className="absolute bottom-0 left-0 w-full h-[18vh] bg-gradient-to-t from-[#4A7c23] to-[#68a434] z-10 shadow-[inset_0_10px_20px_rgba(0,0,0,0.15)] pointer-events-none" />

      {/* Счётчик в правом верхнем углу */}
      <div className="absolute top-6 right-6 sm:top-10 sm:right-10 text-stone-700 font-mono text-sm sm:text-base tracking-[0.2em] z-30 bg-white/70 px-4 py-2 rounded-full backdrop-blur-md border border-white/40 shadow-md">
        ❤️ {clickCount}
      </div>

      {/* Интерактивный ангел по центру */}
      <div 
        className="relative cursor-pointer transition-transform duration-500 hover:scale-[1.02] active:scale-95 z-20 flex items-center justify-center p-4 mb-[8vh]"
        onClick={handleClick}
        title="Click to let go"
      >
        <Image
          src={isLettingGo ? ANGEL_WITHOUT_HEART : ANGEL_WITH_HEART}
          alt="Heart & Angel"
          width={550}
          height={550}
          className="object-contain max-w-[75vw] max-h-[65vh] drop-shadow-[0_15px_25px_rgba(0,0,0,0.15)] pointer-events-none"
          priority
        />
      </div>

      {/* Улетающие анимированные сердца */}
      {hearts.map((heart) => (
        <div
          key={heart.id}
          className="absolute pointer-events-none z-30 flex items-center justify-center animate-fly-away"
          style={{
            width: 120,
            height: 120,
            bottom: '25%',
          }}
        >
          <span className="text-5xl sm:text-6xl filter drop-shadow-[0_0_20px_rgba(255,80,80,0.7)]">
            ❤️
          </span>
        </div>
      ))}

      {/* Плавная CSS-анимация полёта вверх */}
      <style jsx>{`
        @keyframes flyAway {
          0% {
            transform: translateY(0) scale(0.6) rotate(0deg);
            opacity: 1;
          }
          30% {
            opacity: 0.95;
          }
          100% {
            transform: translateY(-65vh) scale(1.3) translateX(25px) rotate(15deg);
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
