'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

const ANGEL_WITH_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png';
const ANGEL_WITHOUT_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0918.png';

export default function LetItGoAngel() {
  const [isLettingGo, setIsLettingGo] = useState(false);
  const [hearts, setHearts] = useState<{ id: number }[]>([]);
  const [clickCount, setClickCount] = useState(0);

  const handleClick = () => {
    if (isLettingGo) return;

    setIsLettingGo(true);
    setHearts((prevHearts) => [...prevHearts, { id: Date.now() }]);
    setClickCount((prevCount) => prevCount + 1);

    setTimeout(() => {
      setIsLettingGo(false);
    }, 500); // Angel returns to original state after 0.5s

    setTimeout(() => {
      setHearts((prevHearts) => prevHearts.slice(1)); // Remove the oldest heart after animation
    }, 5000); // Animation duration is 5s
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
        <div key={heart.id} className="heart" />
      ))}
    </>
  );
}
