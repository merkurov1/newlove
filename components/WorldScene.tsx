'use client';

import React, { useState, useEffect, useRef } from 'react';

const ASSETS = {
  angel: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png',
  daemon: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Daemon1.png',
  heart: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Heart1.png',
  house: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/House1.png',
  sun: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Sun1.png',
  clouds: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Clouds.png',
};

type TimeOfDay = 'day' | 'sunset' | 'night';

interface FallingHeart {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  sway: number;
  swaySpeed: number;
}

export default function WorldScene() {
  const [heroUrl, setHeroUrl] = useState<string>('');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  const [fallingHearts, setFallingHearts] = useState<FallingHeart[]>([]);
  const nextHeartId = useRef(0);

  useEffect(() => {
    setHeroUrl(Math.random() > 0.5 ? ASSETS.angel : ASSETS.daemon);

    const timer = setInterval(() => {
      setTimeOfDay((prev) => {
        if (prev === 'day') return 'sunset';
        if (prev === 'sunset') return 'night';
        return 'day';
      });
    }, 15000);

    return () => clearInterval(timer);
  }, []);

  const triggerHeartRain = () => {
    const newHearts: FallingHeart[] = Array.from({ length: 15 }).map(() => ({
      id: nextHeartId.current++,
      x: Math.random() * window.innerWidth,
      y: -50 - Math.random() * 200,
      size: 20 + Math.random() * 25,
      speed: 1.5 + Math.random() * 2,
      sway: Math.random() * 50,
      swaySpeed: 0.02 + Math.random() * 0.03,
    }));

    setFallingHearts((prev) => [...prev, ...newHearts]);
  };

  useEffect(() => {
    if (fallingHearts.length === 0) return;

    const animationFrame = requestAnimationFrame(() => {
      setFallingHearts((prev) =>
        prev
          .map((h) => ({
            ...h,
            y: h.y + h.speed,
            x: h.x + Math.sin(h.y * h.swaySpeed) * 0.5,
          }))
          .filter((h) => h.y < window.innerHeight + 50)
      );
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [fallingHearts]);

  const bgStyles = {
    day: 'from-sky-300 via-indigo-200 to-blue-400',
    sunset: 'from-orange-400 via-pink-400 to-purple-600',
    night: 'from-slate-900 via-indigo-950 to-blue-950',
  };

  return (
    <div
      onClick={triggerHeartRain}
      className={`relative w-full h-[calc(100vh-5rem)] mt-20 overflow-hidden bg-gradient-to-b ${bgStyles[timeOfDay]} transition-colors duration-1000 select-none cursor-pointer`}
    >
      {/* 1. Облака */}
      <div className="absolute inset-0 opacity-30 pointer-events-none scale-90">
        <img
          src={ASSETS.clouds}
          alt="Clouds"
          className="w-full h-full object-cover filter blur-[1px]"
        />
      </div>

      {/* 2. Солнце (увеличено примерно в 3 раза) */}
      <div
        className={`absolute top-12 left-1/4 w-44 h-44 transition-opacity duration-1000 pointer-events-none ${
          timeOfDay === 'night' ? 'opacity-0' : 'opacity-90'
        }`}
      >
        <img src={ASSETS.sun} alt="Sun" className="w-full h-full object-contain animate-spin-slow" />
      </div>

      {/* 3. Звезды (ночь) */}
      <div
        className={`absolute inset-0 transition-opacity duration-1000 pointer-events-none ${
          timeOfDay === 'night' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="absolute top-10 left-10 w-1.5 h-1.5 bg-white rounded-full animate-ping" />
        <div className="absolute top-20 right-1/4 w-2 h-2 bg-white rounded-full opacity-80" />
        <div className="absolute top-32 left-1/3 w-1 h-1 bg-white rounded-full opacity-60" />
        <div className="absolute top-16 right-16 w-2 h-2 bg-white rounded-full animate-pulse" />
      </div>

      {/* 4. Отрисованная земля (лужайка снизу) */}
      <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-emerald-600 to-emerald-500 rounded-t-[50%] scale-x-125 pointer-events-none opacity-90 shadow-inner" />

      {/* 5. Дом и дерево (увеличены, смещены выше и правее) */}
      <div className="absolute bottom-8 right-16 w-36 md:w-48 pointer-events-none">
        <img src={ASSETS.house} alt="House and Tree" className="w-full h-auto drop-shadow-md" />
        {/* Ночное свечение окна */}
        <div
          className={`absolute bottom-12 right-10 w-3.5 h-5 bg-amber-300 rounded-sm blur-[1px] transition-opacity duration-1000 ${
            timeOfDay === 'night' ? 'opacity-90 shadow-[0_0_12px_#fde047]' : 'opacity-0'
          }`}
        />
      </div>

      {/* 6. Герой (выше, правее, не выпадает из кадра) */}
      {heroUrl && (
        <div className="absolute bottom-8 left-20 md:left-32 w-28 md:w-36 pointer-events-none">
          <img src={heroUrl} alt="Hero" className="w-full h-auto drop-shadow-md" />
        </div>
      )}

      {/* 7. Сердечко-шарик по центру (увеличено в 2 раза) */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none animate-bounce-slow">
        <img src={ASSETS.heart} alt="Heart Balloon" className="w-24 h-24 md:w-32 md:h-32 drop-shadow-xl" />
      </div>

      {/* 8. Скорректированная нитка от руки героя к шарику */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <path
          d="M calc(5rem + 48px) calc(100% - 75px) Q calc(50% - 50px) calc(50% + 20px) 50% 150px"
          fill="none"
          stroke="rgba(0,0,0,0.3)"
          strokeWidth="2"
        />
      </svg>

      {/* 9. Дождь из сердечек */}
      {fallingHearts.map((h) => (
        <img
          key={h.id}
          src={ASSETS.heart}
          alt="Falling Heart"
          style={{
            position: 'absolute',
            left: `${h.x}px`,
            top: `${h.y}px`,
            width: `${h.size * 1.5}px`,
            height: `${h.size * 1.5}px`,
            pointerEvents: 'none',
            opacity: 0.85,
            transform: `rotate(${Math.sin(h.y * 0.05) * 15}deg)`,
          }}
        />
      ))}
    </div>
  );
}
