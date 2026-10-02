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
  heartRain: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/HeartRain.png',
};

interface FallingHeart {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  swaySpeed: number;
}

export default function WorldScene() {
  const [heroUrl, setHeroUrl] = useState<string>('');
  const [timeGradient, setTimeGradient] = useState('');
  const [isNight, setIsNight] = useState(false);
  const [fallingHearts, setFallingHearts] = useState<FallingHeart[]>([]);
  const nextHeartId = useRef(0);

  useEffect(() => {
    setHeroUrl(Math.random() > 0.5 ? ASSETS.angel : ASSETS.daemon);

    // Время суток по часам пользователя
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) {
      setTimeGradient('from-[#A2D2FF] via-[#BDE0FE] to-[#FFC8DD]');
      setIsNight(false);
    } else if (hour >= 12 && hour < 18) {
      setTimeGradient('from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF]');
      setIsNight(false);
    } else if (hour >= 18 && hour < 21) {
      setTimeGradient('from-[#FFB703] via-[#FB8500] to-[#6A0DAD]');
      setIsNight(false);
    } else {
      setTimeGradient('from-[#0B132B] via-[#1C2541] to-[#3A506B]');
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
    <main
      onClick={triggerHeartRain}
      className={`relative w-full h-[calc(100vh-6rem)] mt-24 overflow-hidden bg-gradient-to-b ${timeGradient} transition-colors duration-1000 select-none cursor-pointer flex flex-col justify-end`}
    >
      {/* 1. Облака */}
      <div className="absolute inset-0 opacity-30 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 w-[200%] h-full flex animate-clouds-move">
          <div className="w-1/2 h-full relative">
            <Image src={ASSETS.clouds} alt="Clouds" fill className="object-cover filter blur-[1px]" />
          </div>
          <div className="w-1/2 h-full relative">
            <Image src={ASSETS.clouds} alt="Clouds" fill className="object-cover filter blur-[1px]" />
          </div>
        </div>
      </div>

      {/* 2. Солнце */}
      <div
        className={`absolute top-16 left-[20%] w-32 h-32 md:w-40 md:h-40 pointer-events-none transition-opacity duration-1000 ${
          isNight ? 'opacity-0' : 'opacity-90 drop-shadow-[0_0_30px_rgba(255,220,100,0.5)]'
        }`}
      >
        <Image src={ASSETS.sun} alt="Sun" fill className="object-contain animate-spin-slow" />
      </div>

      {/* Звезды ночью */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${isNight ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute top-12 left-20 w-1.5 h-1.5 bg-white rounded-full animate-ping" />
        <div className="absolute top-24 right-1/3 w-2 h-2 bg-white rounded-full opacity-90 shadow-[0_0_8px_#fff]" />
        <div className="absolute top-36 left-1/4 w-1 h-1 bg-white rounded-full opacity-70" />
        <div className="absolute top-20 right-24 w-2 h-2 bg-white rounded-full animate-pulse" />
      </div>

      {/* 3. Уровень земли */}
      <div className="absolute bottom-0 left-0 w-full h-[30vh] bg-gradient-to-t from-[#4A7c23] to-[#68a434] z-10 rounded-t-[50%] scale-x-125 pointer-events-none shadow-[inset_0_20px_30px_rgba(0,0,0,0.25)]" />

      {/* 4. Видимая нитка от центра сердца к герою (через viewBox SVG для стабильности) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-25" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path
          d="M 50 21 Q 32 45 14 78"
          fill="none"
          stroke="rgba(40, 40, 40, 0.4)"
          strokeWidth="0.5"
          strokeLinecap="round"
        />
      </svg>

      {/* 5. Композиция */}
      
      {/* Герой: сдвинут левее (left-[14%]) и ниже (bottom-[20vh]) */}
      <div className="absolute bottom-[20vh] left-[14%] -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center">
        <div className="absolute -bottom-1 w-24 h-5 bg-black/20 rounded-full blur-[4px]" />
        {heroUrl && (
          <div className="w-28 sm:w-36 md:w-40 h-auto drop-shadow-[0_10px_20px_rgba(0,0,0,0.25)]">
            <Image src={heroUrl} alt="Hero" width={160} height={160} className="w-full h-auto object-contain" priority />
          </div>
        )}
      </div>

      {/* Сердечко-шарик: по центру, выше (top-[18%]) */}
      <div className="absolute top-[18%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex flex-col items-center animate-bounce-slow">
        <div className="w-20 sm:w-28 md:w-32 h-20 sm:h-28 md:h-32 drop-shadow-[0_10px_25px_rgba(239,68,68,0.4)] relative">
          <Image src={ASSETS.heart} alt="Heart Balloon" fill className="object-contain" priority />
        </div>
      </div>

      {/* Домик: сдвинут правее (right-[14%]) и ниже (bottom-[20vh]) */}
      <div className="absolute bottom-[20vh] right-[14%] translate-x-1/2 z-20 pointer-events-none flex flex-col items-center">
        <div className="absolute -bottom-1 w-28 h-5 bg-black/20 rounded-full blur-[4px]" />
        <div className="w-32 sm:w-40 md:w-48 h-auto drop-shadow-[0_10px_25px_rgba(0,0,0,0.3)] relative">
          <Image src={ASSETS.house} alt="House and Tree" width={200} height={200} className="w-full h-auto object-contain" priority />
          {/* Свет в окне ночью */}
          <div className={`absolute bottom-[35%] right-7 w-2.5 h-3.5 bg-amber-300 rounded-sm blur-[0.5px] transition-opacity duration-1000 ${isNight ? 'opacity-100 shadow-[0_0_10px_#fde047]' : 'opacity-0'}`} />
        </div>
      </div>

      {/* 6. Падающие сердечки (HeartRain.png) */}
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
          <Image src={ASSETS.heartRain} alt="Falling Heart" fill className="object-contain filter drop-shadow-[0_0_15px_rgba(255,100,100,0.7)]" />
        </div>
      ))}

      {/* Анимации */}
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
          50% { transform: translate(-50%, -10px); }
        }
        .animate-clouds-move { animation: cloudsMove 45s linear infinite; }
        .animate-spin-slow { animation: spinSlow 35s linear infinite; }
        .animate-bounce-slow { animation: bounceSlow 4s ease-in-out infinite; }
      ` }} />
    </main>
  );
}
