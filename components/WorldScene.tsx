'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

const ASSETS = {
  angel: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png',
  daemon: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Daemon1.png',
  heart: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Heart1.png',
  house: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/House1.png',
  sun: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Sun1.png',
  clouds: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Clouds.png',
};

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
  const [timeGradient, setTimeGradient] = useState('');
  const [isNight, setIsNight] = useState(false);
  const [fallingHearts, setFallingHearts] = useState<FallingHeart[]>([]);
  const nextHeartId = useRef(0);

  useEffect(() => {
    // Случайный выбор между ангелом и демоном
    setHeroUrl(Math.random() > 0.5 ? ASSETS.angel : ASSETS.daemon);

    // Определение времени суток по локальным часам пользователя
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) {
      setTimeGradient('from-[#A2D2FF] via-[#BDE0FE] to-[#FFC8DD]'); // Утро
      setIsNight(false);
    } else if (hour >= 12 && hour < 18) {
      setTimeGradient('from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF]'); // День
      setIsNight(false);
    } else if (hour >= 18 && hour < 21) {
      setTimeGradient('from-[#FFB703] via-[#FB8500] to-[#6A0DAD]'); // Закат
      setIsNight(false);
    } else {
      setTimeGradient('from-[#0B132B] via-[#1C2541] to-[#3A506B]'); // Ночь
      setIsNight(true);
    }
  }, []);

  const triggerHeartRain = () => {
    const newHearts: FallingHeart[] = Array.from({ length: 12 }).map(() => ({
      id: nextHeartId.current++,
      x: Math.random() * window.innerWidth,
      y: -50 - Math.random() * 150,
      size: 25 + Math.random() * 20,
      speed: 1.5 + Math.random() * 2,
      sway: Math.random() * 40,
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
            x: h.x + Math.sin(h.y * h.swaySpeed) * 0.6,
          }))
          .filter((h) => h.y < window.innerHeight + 50)
      );
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [fallingHearts]);

  return (
    <div
      onClick={triggerHeartRain}
      className={`relative w-full h-[calc(100vh-6rem)] mt-24 overflow-hidden bg-gradient-to-b ${timeGradient} transition-colors duration-1000 select-none cursor-pointer flex flex-col justify-end`}
    >
      {/* 1. Бесконечно движущиеся облака */}
      <div className="absolute inset-0 opacity-35 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 w-[200%] h-full flex animate-clouds-move">
          <div className="w-1/2 h-full relative">
            <Image src={ASSETS.clouds} alt="Clouds" fill className="object-cover filter blur-[1px]" />
          </div>
          <div className="w-1/2 h-full relative">
            <Image src={ASSETS.clouds} alt="Clouds" fill className="object-cover filter blur-[1px]" />
          </div>
        </div>
      </div>

      {/* 2. Солнце / Луна с мягким свечением */}
      <div
        className={`absolute top-16 left-1/4 w-36 h-36 md:w-44 md:h-44 pointer-events-none transition-opacity duration-1000 ${
          isNight ? 'opacity-0' : 'opacity-90 drop-shadow-[0_0_35px_rgba(255,220,100,0.6)]'
        }`}
      >
        <Image src={ASSETS.sun} alt="Sun" fill className="object-contain animate-spin-slow" />
      </div>

      {/* Звездное небо для ночного режима */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${isNight ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute top-12 left-20 w-1.5 h-1.5 bg-white rounded-full animate-ping" />
        <div className="absolute top-24 right-1/3 w-2 h-2 bg-white rounded-full opacity-90 shadow-[0_0_8px_#fff]" />
        <div className="absolute top-36 left-1/4 w-1 h-1 bg-white rounded-full opacity-70" />
        <div className="absolute top-20 right-20 w-2 h-2 bg-white rounded-full animate-pulse" />
      </div>

      {/* 3. Объемная земля (холмистый луг) с тенью */}
      <div className="absolute bottom-0 left-0 w-full h-[22vh] bg-gradient-to-t from-[#4A7c23] to-[#68a434] z-10 rounded-t-[50%] scale-x-125 pointer-events-none shadow-[inset_0_15px_25px_rgba(0,0,0,0.2)]" />

      {/* 4. Безопасная центрированная сцена (Stage), исключающая вылет за рамки */}
      <div className="relative w-full max-w-6xl mx-auto h-full flex items-end justify-between px-8 md:px-16 pb-6 z-20 pointer-events-none">
        
        {/* Герой слева с контактной тенью */}
        <div className="relative flex flex-col items-center">
          <div className="absolute -bottom-2 w-28 h-6 bg-black/25 rounded-full blur-[4px]" />
          {heroUrl && (
            <div className="w-28 sm:w-36 md:w-44 h-auto drop-shadow-[0_10px_20px_rgba(0,0,0,0.25)] transition-transform hover:scale-105">
              <Image src={heroUrl} alt="Hero" width={180} height={180} className="w-full h-auto object-contain" priority />
            </div>
          )}
        </div>

        {/* Сердечко-шарик по центру с анимацией парения */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center animate-bounce-slow">
          <div className="w-24 sm:w-32 md:w-36 h-24 sm:h-32 md:h-36 drop-shadow-[0_10px_30px_rgba(239,68,68,0.5)] relative">
            <Image src={ASSETS.heart} alt="Heart Balloon" fill className="object-contain" priority />
          </div>
        </div>

        {/* Домик справа с контактной тенью и окном */}
        <div className="relative flex flex-col items-center">
          <div className="absolute -bottom-2 w-32 h-6 bg-black/25 rounded-full blur-[4px]" />
          <div className="w-36 sm:w-44 md:w-52 h-auto drop-shadow-[0_10px_25px_rgba(0,0,0,0.3)] relative">
            <Image src={ASSETS.house} alt="House and Tree" width={220} height={220} className="w-full h-auto object-contain" priority />
            {/* Свечение окна в ночное время */}
            <div className={`absolute bottom-1/3 right-8 w-3 h-4 bg-amber-300 rounded-sm blur-[0.5px] transition-opacity duration-1000 ${isNight ? 'opacity-100 shadow-[0_0_10px_#fde047]' : 'opacity-0'}`} />
          </div>
        </div>

      </div>

      {/* 5. Интерактивные падающие сердечки при клике */}
      {fallingHearts.map((h) => (
        <div
          key={h.id}
          className="absolute pointer-events-none z-30"
          style={{
            left: `${h.x}px`,
            top: `${h.y}px`,
            width: `${h.size * 1.5}px`,
            height: `${h.size * 1.5}px`,
            transform: `rotate(${Math.sin(h.y * 0.05) * 20}deg)`,
          }}
        >
          <Image src={ASSETS.heart} alt="Falling Heart" fill className="object-contain filter drop-shadow-[0_0_15px_rgba(255,100,100,0.7)]" />
        </div>
      ))}

      {/* CSS-анимации для облаков, вращения солнца и покачивания */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes cloudsMove {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes spinSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes bounceSlow {
          0%, 100% { transform: translate(-50%, 0); }
          50% { transform: translate(-50%, -12px); }
        }
        .animate-clouds-move { animation: cloudsMove 40s linear infinite; }
        .animate-spin-slow { animation: spinSlow 30s linear infinite; }
        .animate-bounce-slow { animation: bounceSlow 4s ease-in-out infinite; }
      ` }} />
    </div>
  );
}
