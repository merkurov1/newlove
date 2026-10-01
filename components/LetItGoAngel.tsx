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

  const clickCountRef = useRef(clickCount);
  clickCountRef.current = clickCount;

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
    setHearts((prevHearts) => [...prevHearts, { id: Date.now() }]);
    setClickCount((prevCount) => prevCount + 1);

    setTimeout(() => {
      setIsLettingGo(false);
    }, 5000);

    setTimeout(() => {
      setHearts((prevHearts) => prevHearts.slice(1));
    }, 5000);
  };

  return (
    <main className="relative w-full h-screen overflow-hidden bg-[#0a0a0c] flex flex-col items-center justify-center select-none">
      {/* Счетчик */}
      <div className="absolute top-8 right-8 text-white/70 font-mono text-lg tracking-widest z-20">
        ❤️ {clickCount}
      </div>

      {/* Контейнер ангела */}
      <div 
        className="relative cursor-pointer transition-transform duration-300 hover:scale-105 z-10 flex items-center justify-center"
        onClick={handleClick}
      >
        <Image
          src={isLettingGo ? ANGEL_WITHOUT_HEART : ANGGL_WITH_HEART_FIXED(isLettingGo)}
          alt="Angel"
          width={500}
          height={500}
          className="object-contain max-w-[80vw] max-h-[70vh] drop-shadow-[0_0_35px_rgba(255,255,255,0.1)]"
          priority
        />
      </div>

      {/* Летящие сердечки / шарики */}
      {hearts.map((heart) => (
        <div
          key={heart.id}
          className="absolute pointer-events-none z-30 flex items-center justify-center animate-fly-up"
          style={{
            width: 150,
            height: 150,
            bottom: '30%',
          }}
        >
          <span className="text-6xl filter drop-shadow-[0_0_15px_rgba(255,100,100,0.6)]">❤️</span>
        </div>
      ))}

      {/* Локальные стили для анимации подъема */}
      <style jsx>{`
        @keyframes flyUp {
          0% {
            transform: translateY(0) scale(0.8);
            opacity: 1;
          }
          50% {
            opacity: 0.9;
          }
          100% {
            transform: translateY(-70vh) scale(1.4) translateX(20px);
            opacity: 0;
          }
        }

        .animate-fly-up {
          animation: flyUp 5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
      `}</style>
    </main>
  );
}

// Вспомогательная функция для чистоты кода смены картинок
function ANGGL_WITH_HEART_FIXED(isLettingGo: boolean) {
  return isLettingGo ? ANGEL_WITHOUT_HEART : ANGEL_WITH_HEART;
}
