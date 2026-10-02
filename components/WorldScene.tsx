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
  ambientAudio: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Drift%20of%20Glass.mp3',
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
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  // Отслеживание движения мыши для параллакса
  const handleMouseMove = (e: React.MouseEvent) => {
    const { innerWidth, innerHeight } = window;
    const x = (e.clientX - innerWidth / 2) / (innerWidth / 2); // от -1 до 1
    const y = (e.clientY - innerHeight / 2) / (innerHeight / 2); // от -1 до 1
    setMousePos({ x, y });
  };

  // Управление фоновой музыкой
  const toggleAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;

    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlayingAudio(true);
      }).catch((err) => {
        console.log("Audio playback error:", err);
      });
    }
  };

  const triggerHeartRain = (e: React.MouseEvent) => {
    // Не запускать дождь, если кликнули по кнопке звука
    if ((e.target as HTMLElement).closest('button')) return;

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
      onMouseMove={handleMouseMove}
      className={`relative w-full h-[calc(100vh-6rem)] mt-24 overflow-hidden bg-gradient-to-b ${timeGradient} transition-colors duration-1000 select-none cursor-pointer flex flex-col justify-end`}
    >
      {/* Скрытый аудиоэлемент */}
      <audio ref={audioRef} src={ASSETS.ambientAudio} loop preload="auto" />

      {/* Кнопка управления звуком в правом верхнем углу сцены */}
      <div className="absolute top-6 right-6 z-45">
        <button
          onClick={toggleAudio}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/25 backdrop-blur-md border border-white/40 text-white/90 hover:bg-white/35 transition-all shadow-lg group"
          title={isPlayingAudio ? "Выключить музыку" : "Включить музыку"}
        >
          {isPlayingAudio ? (
            <>
              <svg className="w-5 h-5 text-pink-200 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              <span className="text-xs font-medium tracking-wide">Sound On</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
              <span className="text-xs font-medium tracking-wide">Sound Off</span>
            </>
          )}
        </button>
      </div>

      {/* 1. Облака (самый дальний слой параллакса) */}
      <div 
        className="absolute inset-0 opacity-30 pointer-events-none overflow-hidden transition-transform duration-200 ease-out"
        style={{ transform: `translate(${-mousePos.x * 15}px, ${-mousePos.y * 10}px)` }}
      >
        <div className="absolute inset-0 w-[200%] h-full flex animate-clouds-move">
          <div className="w-1/2 h-full relative">
            <Image src={ASSETS.clouds} alt="" fill className="object-cover filter blur-[1px]" draggable={false} />
          </div>
          <div className="w-1/2 h-full relative">
            <Image src={ASSETS.clouds} alt="" fill className="object-cover filter blur-[1px]" draggable={false} />
          </div>
        </div>
      </div>

      {/* 2. Солнце / Небесный слой */}
      <div
        className={`absolute top-16 left-[20%] w-32 h-32 md:w-40 md:h-40 pointer-events-none transition-opacity duration-1000 ease-out`}
        style={{
          opacity: isNight ? 0 : 0.9,
          transform: `translate(${mousePos.x * 20}px, ${mousePos.y * 15}px)`
        }}
      >
        <Image src={ASSETS.sun} alt="" fill className="object-contain animate-spin-slow drop-shadow-[0_0_30px_rgba(255,220,100,0.5)]" draggable={false} />
      </div>

      {/* Звезды ночью */}
      <div 
        className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ease-out`}
        style={{
          opacity: isNight ? 1 : 0,
          transform: `translate(${mousePos.x * 10}px, ${mousePos.y * 10}px)`
        }}
      >
        <div className="absolute top-12 left-20 w-1.5 h-1.5 bg-white rounded-full animate-ping" />
        <div className="absolute top-24 right-1/3 w-2 h-2 bg-white rounded-full opacity-90 shadow-[0_0_8px_#fff]" />
        <div className="absolute top-36 left-1/4 w-1 h-1 bg-white rounded-full opacity-70" />
        <div className="absolute top-20 right-24 w-2 h-2 bg-white rounded-full animate-pulse" />
      </div>

      {/* 3. Уровень земли */}
      <div className="absolute bottom-0 left-0 w-full h-[30vh] bg-gradient-to-t from-[#4A7c23] to-[#68a434] z-10 rounded-t-[50%] scale-x-125 pointer-events-none shadow-[inset_0_20px_30px_rgba(0,0,0,0.25)]" />

      {/* 4. Композиция персонажей и объектов с параллаксом средней глубины */}
      
      {/* Герой */}
      <div 
        className="absolute bottom-[20vh] left-[32%] -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center transition-transform duration-150 ease-out"
        style={{ transform: `translate(calc(-50% + ${mousePos.x * 25}px), ${mousePos.y * 15}px)` }}
      >
        <div className="absolute -bottom-1 w-24 h-5 bg-black/20 rounded-full blur-[4px]" />
        {heroUrl && (
          <div className="w-32 h-36 sm:w-38 sm:h-44 flex items-end justify-center drop-shadow-[0_10px_20px_rgba(0,0,0,0.25)]">
            <Image src={heroUrl} alt="" width={160} height={180} className="w-full h-full object-contain" priority draggable={false} />
          </div>
        )}
      </div>

      {/* Центральное сердце на ниточке */}
      <div 
        className="absolute top-[18%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex flex-col items-center animate-bounce-slow transition-transform duration-150 ease-out"
        style={{ transform: `translate(calc(-50% + ${mousePos.x * 18}px), ${mousePos.y * 10}px)` }}
      >
        <div className="w-20 sm:w-28 md:w-32 h-20 sm:h-28 md:h-32 drop-shadow-[0_10px_25px_rgba(239,68,68,0.4)] relative">
          <Image src={ASSETS.heart} alt="" fill className="object-contain" priority draggable={false} />
        </div>
        <svg className="w-8 h-36 overflow-visible -mt-1" viewBox="0 0 20 120">
          <path
            d="M 10 0 Q 22 60 4 115"
            fill="none"
            stroke="rgba(40, 40, 40, 0.45)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Домик */}
      <div 
        className="absolute bottom-[20vh] right-[32%] translate-x-1/2 z-20 pointer-events-none flex flex-col items-center transition-transform duration-150 ease-out"
        style={{ transform: `translate(calc(50% + ${mousePos.x * 30}px), ${mousePos.y * 18}px)` }}
      >
        <div className="absolute -bottom-1 w-28 h-5 bg-black/20 rounded-full blur-[4px]" />
        <div className="w-32 sm:w-40 md:w-48 h-auto drop-shadow-[0_10px_25px_rgba(0,0,0,0.3)] relative">
          <Image src={ASSETS.house} alt="" width={200} height={200} className="w-full h-auto object-contain" priority draggable={false} />
          <div className={`absolute bottom-[35%] right-7 w-2.5 h-3.5 bg-amber-300 rounded-sm blur-[0.5px] transition-opacity duration-1000 ${isNight ? 'opacity-100 shadow-[0_0_10px_#fde047]' : 'opacity-0'}`} />
        </div>
      </div>

      {/* 5. Падающие сердечки (передний план) */}
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
          <Image src={ASSETS.heartRain} alt="" fill className="object-contain filter drop-shadow-[0_0_15px_rgba(255,100,100,0.7)]" draggable={false} />
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
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-clouds-move { animation: cloudsMove 45s linear infinite; }
        .animate-spin-slow { animation: spinSlow 35s linear infinite; }
        .animate-bounce-slow { animation: bounceSlow 4s ease-in-out infinite; }
      ` }} />
    </main>
  );
}
