'use client';

import React, { useState, useEffect, useRef } from 'react';

// Ссылки на ассеты из Supabase
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
  // Рандомный выбор героя при монтировании (Ангел или Чёртик)
  const [heroUrl, setHeroUrl] = useState<string>('');
  
  // Время суток (автоматическая смена по циклу или времени)
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');

  // Дождь из сердечек
  const [fallingHearts, setFallingHearts] = useState<FallingHeart[]>([]);
  const nextHeartId = useRef(0);

  useEffect(() => {
    // Рандом героя
    setHeroUrl(Math.random() > 0.5 ? ASSETS.angel : ASSETS.daemon);

    // Автоматическая смена времени суток каждые 15 секунд для демо/цикла
    // (День -> Закат -> Ночь -> День)
    const timer = setInterval(() => {
      setTimeOfDay((prev) => {
        if (prev === 'day') return 'sunset';
        if (prev === 'sunset') return 'night';
        return 'day';
      });
    }, 15000);

    return () => clearInterval(timer);
  }, []);

  // Функция запуска дождя из сердечек (по двойному тапу или клику)
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

  // Анимация падающих сердечек
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

  // Цвета фоновых градиентов для разного времени суток
  const bgStyles = {
    day: 'from-sky-300 via-indigo-200 to-blue-400',
    sunset: 'from-orange-400 via-pink-400 to-purple-600',
    night: 'from-slate-900 via-indigo-950 to-blue-950',
  };

  return (
    <div
      onClick={triggerHeartRain}
      className={`relative w-full h-screen overflow-hidden bg-gradient-to-b ${bgStyles[timeOfDay]} transition-colors duration-1000 select-none cursor-pointer`}
    >
      {/* 1. Облака (медленно плывут) */}
      <div className="absolute inset-0 opacity-40 pointer-events-none animate-pulse">
        <img
          src={ASSETS.clouds}
          alt="Clouds"
          className="w-full h-full object-cover filter blur-[1px]"
        />
      </div>

      {/* 2. Солнце (видно только днем и на закате) */}
      <div
        className={`absolute top-12 left-1/4 w-32 h-32 transition-opacity duration-1000 pointer-events-none ${
          timeOfDay === 'night' ? 'opacity-0' : 'opacity-90'
        }`}
      >
        <img src={ASSETS.sun} alt="Sun" className="w-full h-full object-contain animate-spin-slow" />
      </div>

      {/* 3. Звезды (появляются ночью) */}
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

      {/* 4. Дом и дерево (справа) */}
      <div className="absolute bottom-16 right-12 w-64 md:w-96 pointer-events-none">
        <img src={ASSETS.house} alt="House and Tree" className="w-full h-auto drop-shadow-lg" />
        {/* Ночное свечение окна (зарезервировано под ночь) */}
        <div
          className={`absolute bottom-24 right-20 w-8 h-10 bg-amber-300 rounded-sm blur-[2px] transition-opacity duration-1000 ${
            timeOfDay === 'night' ? 'opacity-90 shadow-[0_0_15px_#fde047]' : 'opacity-0'
          }`}
        />
      </div>

      {/* 5. Герой (слева, статичный) + Сердечко-шарик */}
      {heroUrl && (
        <div className="absolute bottom-16 left-12 md:left-24 flex items-end pointer-events-none">
          {/* Сам герой */}
          <div className="w-40 md:w-56">
            <img src={heroUrl} alt="Hero" className="w-full h-auto drop-shadow-md" />
          </div>

          {/* Сердечко-шарик на ниточке, парящее над героем с эффектом «дыхания» */}
          <div className="absolute -top-32 left-16 md:left-24 animate-bounce-slow">
            <svg className="absolute -bottom-16 -left-6 w-16 h-20 overflow-visible pointer-events-none">
              <path
                d="M 32 80 Q 20 40 32 0"
                fill="none"
                stroke="rgba(0,0,0,0.3)"
                strokeWidth="2"
              />
            </svg>
            <img src={ASSETS.heart} alt="Heart Balloon" className="w-16 h-16 md:w-20 md:h-20 drop-shadow-lg" />
          </div>
        </div>
      )}

      {/* 6. Дождь из сердечек (по клику/жесту) */}
      {fallingHearts.map((h) => (
        <img
          key={h.id}
          src={ASSETS.heart}
          alt="Falling Heart"
          style={{
            position: 'absolute',
            left: `${h.x}px`,
            top: `${h.y}px`,
            width: `${h.size}px`,
            height: `${h.size}px`,
            pointerEvents: 'none',
            opacity: 0.85,
            transform: `rotate(${Math.sin(h.y * 0.05) * 15}deg)`,
          }}
        />
      ))}

      {/* Подсказка для теста (потом можно убрать) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs md:text-sm tracking-widest pointer-events-none">
        [ Нажми в любое место экрана для дождя из сердечек ]
      </div>
    </div>
  );
}
