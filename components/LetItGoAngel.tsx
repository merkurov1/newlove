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
          author: 'Visitor' // API подхватит профиль, если авторизован
        };

        // Используем sendBeacon для гарантированной отправки при закрытии/переходе
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
    <>
      <div className="click-counter">❤️ {clickCount}</div>
      <div className="angel-container" onClick={handleClick}>
        <Image
          src={isLettingGo ? ANGEL_WITHOUT_HEART : ANGEL_WITH_HEART}
          alt="Angel"
          width={600}
          height={600}
          className="angel-image"
          priority
        />
      </div>
      {hearts.map((heart) => (
        <div
          key={heart.id}
          className="heart"
          style={{
            width: 150,
            height: 150,
            minWidth: 150,
            minHeight: 150,
            maxWidth: 150,
            maxHeight: 150,
          }}
        />
      ))}
    </>
  );
}
