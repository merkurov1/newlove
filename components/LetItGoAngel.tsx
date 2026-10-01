'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

const ANGEL_WITH_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0918.png';
const ANGEL_WITHOUT_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png';

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
    const newHeartId = ++heartIdCounter.current;
    setFlyingHearts((prev) => [...prev, { id: newHeartId }]);
    setClickCount((prev) => prev + 1);
    
    // Переводим ангела в состояние "без сердца" и оставляем его в нем
    setShowWithoutHeart(true);

    // Удаляем улетевшее сердечко из DOM после завершения анимации (4 секунды)
    setTimeout(() => {
      setFlyingHearts((prev) => prev.filter((h) => h.id !== newHeartId));
    }, 4000);
  };

  return (
    <main className="letitgo-container select-none">
      
      {/* Счётчик отпусканий (использует ваш класс .click-counter) */}
      <div className="click-counter">
        ❤️ {clickCount}
      </div>

      {/* Ангел (использует ваш класс .angel-container и плавное переключение состояний) */}
      <div 
        className="angel-container"
        onClick={handleClick}
        title="Click to let go"
      >
        <div className="relative w-full h-full">
          <Image
            src={ANGEL_WITH_HEART}
            alt="Angel with heart"
            fill
            className={`angel-image transition-opacity duration-150 ${
              showWithoutHeart ? 'opacity-0' : 'opacity-100'
            }`}
            priority
          />
          <Image
            src={ANGEL_WITHOUT_HEART}
            alt="Angel without heart"
            fill
            className={`angel-image transition-opacity duration-150 ${
              showWithoutHeart ? 'opacity-100' : 'opacity-0'
            }`}
            priority
          />
        </div>
      </div>

      {/* Улетающие сердечки (анимация и фон автоматически подтягиваются из вашего класса .heart) */}
      {flyingHearts.map((heart) => (
        <div key={heart.id} className="heart" />
      ))}
    </main>
  );
}
