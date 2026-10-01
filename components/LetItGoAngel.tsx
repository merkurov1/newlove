'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

const ANGEL_WITH_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png';
const ANGEL_WITHOUT_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0918.png';

export default function LetItGoAngel() {
  const [isLettingGo, setIsLettingGo] = useState(false);
  const [hearts, setHearts] = useState<{ id: number }[]>([]);
  const [clickCount, setClickCount] = useState(0);

  // Используем ref, чтобы в замыкании unmount-эффекта всегда видеть актуальный clickCount
  const clickCountRef = useRef(clickCount);
  clickCountRef.current = clickCount;

  // Отправка результатов в храм при уходе со страницы, если сессия была активной
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
    setHearts((prevHearts) => [...prevHearts, { id: newHeartId }]);
    setClickCount((prevCount) => prevCount + 1);

    // Возвращаем сердце ангелу через 5 секунд
    setTimeout(() => {
      setIsLettingGo(false);
    }, 5000);

    // Удаляем улетевший элемент из DOM после завершения анимации
    setTimeout(() => {
      setHearts((prevHearts) => prevHearts.filter((h) => h.id !== newHeartId));
    }, 5000);
  };

  return (
    <main className="relative w-full h-[100dvh] overflow-hidden bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1a1a24] via-[#0d0d12] to-[#050507] flex flex-col items-center justify-center select-none">
      
      {/* Счётчик отпусканий в углу */}
      <div className="absolute top-6 right-6 sm:top-10 sm:right-10 text-white/60 font-mono text-sm sm:text-base tracking-[0.2em] z-30 bg-white/5 px-4 py-2 rounded-full backdrop-blur-md border border-white/10 shadow-lg">
        ❤️ {clickCount}
      </div>

      {/* Интерактивный контейнер с ангелом */}
      <div 
        className="relative cursor-pointer transition-transform duration-500 hover:scale-[1.02] active:scale-95 z-20 flex items-center justify-center p-4"
        onClick={handleClick}
        title="Click to let go"
      >
        <Image
          src={isLettingGo ? ANGEL_WITHOUT_HEART : ANGEL_WITH_HEART}
          alt="Heart & Angel"
          width={550}
          height={550}
          className="object-contain max-w-[75vw] max-h-[70vh] drop-shadow-[0_0_50px_rgba(255,255,255,0.08)] pointer-events-none"
          priority
        />
      </div>

      {/* Анимированные улетающие сердца */}
      {hearts.map((heart) => (
        <div
          key={heart.id}
          className="absolute pointer-events-none z-30 flex items-center justify-center animate-fly-away"
          style={{
            width: 120,
            height: 120,
            bottom: '35%',
          }}
        >
          <span className="text-5xl sm:text-6xl filter drop-shadow-[0_0_20px_rgba(255,100,100,0.8)]">
            ❤️
          </span>
        </div>
      ))}

      {/* CSS-анимация полета сердечка */}
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
            transform: translateY(-65vh) scale(1.3) translateX(30px) rotate(15deg);
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
