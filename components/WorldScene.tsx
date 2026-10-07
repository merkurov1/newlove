'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import SoundToggle from '@/components/SoundToggle';

const ASSETS = {
  angel:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png',
  daemon:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Daemon1.png',
  heart:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Heart1.png',
  house:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/House1.png',
  sun:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Sun1.png',
  clouds:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Clouds.png',
  heartRain:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/HeartRain.png',
};

interface FallingHeart {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  swaySpeed: number;
}

interface PointerPosition {
  x: number;
  y: number;
}

export default function WorldScene() {
  const [heroUrl, setHeroUrl] = useState('');
  const [timeGradient, setTimeGradient] = useState(
    'from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF]'
  );
  const [isNight, setIsNight] = useState(false);
  const [cloudOpacity, setCloudOpacity] = useState(0.3);
  const [fallingHearts, setFallingHearts] = useState<FallingHeart[]>([]);

  const nextHeartId = useRef(0);
  const mousePos = useRef<PointerPosition>({ x: 0, y: 0 });
  const sceneRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Intentionally random: Angel / Daemon is a core World feature.
    setHeroUrl(Math.random() > 0.5 ? ASSETS.angel : ASSETS.daemon);

    const updateFallbackTime = () => {
      const hour = new Date().getHours();

      if (hour >= 6 && hour < 12) {
        setTimeGradient(
          'from-[#A2D2FF] via-[#BDE0FE] to-[#FFC8DD]'
        );
        setIsNight(false);
        setCloudOpacity(0.3);
      } else if (hour >= 12 && hour < 18) {
        setTimeGradient(
          'from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF]'
        );
        setIsNight(false);
        setCloudOpacity(0.25);
      } else if (hour >= 18 && hour < 21) {
        setTimeGradient(
          'from-[#FFB703] via-[#FB8500] to-[#6A0DAD]'
        );
        setIsNight(false);
        setCloudOpacity(0.4);
      } else {
        setTimeGradient(
          'from-[#0B132B] via-[#1C2541] to-[#3A506B]'
        );
        setIsNight(true);
        setCloudOpacity(0.2);
      }
    };

    updateFallbackTime();

    const loadWeather = async () => {
      try {
        const res = await fetch('/api/world/weather', {
          cache: 'no-store',
        });

        if (!res.ok) return;

        const data = await res.json();

        if (!data?.available) return;

        const night = data.isDay === false;
        const weathercode = Number(data.weatherCode);

        setIsNight(night);

        if (weathercode >= 51 && weathercode <= 82) {
          setTimeGradient(
            night
              ? 'from-[#050B14] via-[#0F172A] to-[#1E293B]'
              : 'from-[#748CAB] via-[#3E5C76] to-[#1D2D44]'
          );
          setCloudOpacity(0.65);
        } else if (weathercode >= 1 && weathercode <= 3) {
          setTimeGradient(
            night
              ? 'from-[#0B132B] via-[#1C2541] to-[#3A506B]'
              : 'from-[#B0C4DE] via-[#C5D3E8] to-[#E2E8F0]'
          );
          setCloudOpacity(0.45);
        } else if (night) {
          setTimeGradient(
            'from-[#0B132B] via-[#1C2541] to-[#3A506B]'
          );
          setCloudOpacity(0.2);
        } else {
          setTimeGradient(
            'from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF]'
          );
          setCloudOpacity(0.3);
        }
      } catch (error) {
        console.log(
          'World weather unavailable; device-time fallback remains active.',
          error
        );
      }
    };

    void loadWeather();
  }, []);

  const handlePointerMove = (
    event: React.PointerEvent<HTMLElement>
  ) => {
    const { innerWidth, innerHeight } = window;

    if (!innerWidth || !innerHeight) return;

    mousePos.current = {
      x: (event.clientX - innerWidth / 2) / (innerWidth / 2),
      y: (event.clientY - innerHeight / 2) / (innerHeight / 2),
    };

    const heart = sceneRef.current?.querySelector<HTMLElement>(
      '[data-world-heart]'
    );

    if (!heart) return;

    heart.style.setProperty(
      '--heart-x',
      `${mousePos.current.x * 30}px`
    );
    heart.style.setProperty(
      '--heart-y',
      `${mousePos.current.y * 20}px`
    );
  };

  const triggerHeartRain = (
    event?: React.MouseEvent<HTMLButtonElement>
  ) => {
    event?.stopPropagation();

    const newHearts: FallingHeart[] = Array.from({
      length: 12,
    }).map(() => ({
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

    let frameId = 0;

    const animate = () => {
      setFallingHearts((prev) => {
        if (prev.length === 0) return prev;

        const next = prev
          .map((heart) => ({
            ...heart,
            y: heart.y + heart.speed,
            x:
              heart.x +
              Math.sin(heart.y * heart.swaySpeed) * 0.6,
          }))
          .filter(
            (heart) =>
              heart.y < window.innerHeight + 50
          );

        return next;
      });

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [fallingHearts.length]);

  return (
    <main
      ref={sceneRef}
      onPointerMove={handlePointerMove}
      className={`relative isolate w-full h-[100dvh] overflow-hidden bg-gradient-to-b ${timeGradient} transition-colors duration-1000 select-none`}
    >
      <section
        className="sr-only"
        aria-labelledby="world-title"
      >
        <h1 id="world-title">
          Heart &amp; Angel World
        </h1>

        <p>
          An interactive digital landscape where
          angels, demons, weather, memory and love
          coexist.
        </p>

        <nav aria-label="World rituals">
          <Link href="/heartandangel/calm">
            Keep Calm
          </Link>

          <Link href="/heartandangel/letitgo">
            Let It Go
          </Link>

          <Link href="/temple">
            Enter the Temple
          </Link>
        </nav>
      </section>

      {/* Global Heart & Angel / Temple sound */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-50">
        <SoundToggle
          showTextOnMobile
          className="px-3.5 py-2 sm:px-4 sm:py-2 border border-white/50 bg-white/30 text-white/95 hover:bg-white/45 shadow-xl"
          iconClassName="text-pink-200"
        />
      </div>

      {/* Clouds */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden transition-opacity duration-1000"
        style={{ opacity: cloudOpacity }}
        aria-hidden="true"
      >
        <div className="absolute inset-0 w-[200%] h-full flex animate-clouds-move">
          <div className="w-1/2 h-full relative">
            <Image
              src={ASSETS.clouds}
              alt=""
              fill
              className="object-cover blur-[1px]"
              draggable={false}
            />
          </div>

          <div className="w-1/2 h-full relative">
            <Image
              src={ASSETS.clouds}
              alt=""
              fill
              className="object-cover blur-[1px]"
              draggable={false}
            />
          </div>
        </div>
      </div>

      {/* Sun */}
      <div
        className={`absolute top-32 sm:top-36 left-[15%] sm:left-[20%] w-28 h-28 sm:w-40 sm:h-40 pointer-events-none transition-all duration-1000 ${
          isNight
            ? 'opacity-0 scale-75'
            : 'opacity-90 scale-100 drop-shadow-[0_0_30px_rgba(255,220,100,0.5)]'
        }`}
        aria-hidden="true"
      >
        <Image
          src={ASSETS.sun}
          alt=""
          fill
          className="object-contain animate-spin-slow"
          draggable={false}
        />
      </div>

      {/* Stars */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${
          isNight ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      >
        <div className="absolute top-24 left-16 w-1.5 h-1.5 bg-white rounded-full animate-ping" />
        <div className="absolute top-36 right-1/3 w-2 h-2 bg-white rounded-full opacity-90 shadow-[0_0_8px_#fff]" />
        <div className="absolute top-44 left-1/4 w-1 h-1 bg-white rounded-full opacity-70" />
        <div className="absolute top-28 right-20 w-2 h-2 bg-white rounded-full animate-pulse" />
        <div className="absolute top-52 right-1/4 w-1.5 h-1.5 bg-white/80 rounded-full" />
      </div>

      {/* Ground */}
      <div
        className="absolute bottom-0 left-0 w-full h-[28vh] sm:h-[30vh] bg-gradient-to-t from-[#4A7c23] to-[#68a434] z-10 rounded-t-[50%] scale-x-125 pointer-events-none shadow-[inset_0_20px_30px_rgba(0,0,0,0.25)]"
        aria-hidden="true"
      />

      {/* Random Angel / Daemon */}
      <div className="absolute bottom-[18vh] sm:bottom-[20vh] left-[30%] sm:left-[32%] -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center">
        <div
          className="absolute -bottom-1 w-20 sm:w-24 h-4 sm:h-5 bg-black/20 rounded-full blur-[4px]"
          aria-hidden="true"
        />

        {heroUrl && (
          <div className="w-28 h-32 sm:w-38 sm:h-44 flex items-end justify-center drop-shadow-[0_10px_20px_rgba(0,0,0,0.25)]">
            <Image
              src={heroUrl}
              alt=""
              width={160}
              height={180}
              className="w-full h-full object-contain"
              priority
              draggable={false}
            />
          </div>
        )}
      </div>

      {/* Heart balloon */}
      <button
        type="button"
        data-world-heart
        onClick={triggerHeartRain}
        aria-label="Release a rain of hearts"
        className="absolute top-[26%] sm:top-[28%] left-1/2 z-20 pointer-events-auto flex flex-col items-center animate-bounce-slow transition-transform duration-300 ease-out cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded-full"
        style={{
          transform:
            'translate(calc(-50% + var(--heart-x, 0px)), calc(-50% + var(--heart-y, 0px)))',
        }}
      >
        <div className="w-20 sm:w-28 md:w-32 h-20 sm:h-28 md:h-32 drop-shadow-[0_10px_25px_rgba(239,68,68,0.4)] relative">
          <Image
            src={ASSETS.heart}
            alt=""
            fill
            className="object-contain"
            priority
            draggable={false}
          />
        </div>

        <svg
          className="w-8 h-28 sm:h-36 overflow-visible -mt-1"
          viewBox="0 0 20 120"
          aria-hidden="true"
        >
          <path
            d="M 10 0 Q 22 60 4 115"
            fill="none"
            stroke="rgba(40, 40, 40, 0.45)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* House / Temple */}
      <Link
        href="/temple"
        aria-label="Enter the Temple"
        onClick={(event) => event.stopPropagation()}
        className="absolute bottom-[18vh] sm:bottom-[20vh] right-[30%] sm:right-[32%] translate-x-1/2 z-20 flex flex-col items-center cursor-pointer group"
      >
        <div
          className="absolute -bottom-1 w-24 sm:w-28 h-4 sm:h-5 bg-black/20 rounded-full blur-[4px]"
          aria-hidden="true"
        />

        <div className="w-28 sm:w-40 md:w-48 h-auto drop-shadow-[0_10px_25px_rgba(0,0,0,0.3)] relative transition-transform duration-300 group-hover:scale-105">
          <Image
            src={ASSETS.house}
            alt=""
            width={200}
            height={200}
            className="w-full h-auto object-contain"
            priority
            draggable={false}
          />

          <div
            className={`absolute bottom-[35%] right-7 w-2.5 h-3.5 bg-amber-300 rounded-sm blur-[0.5px] transition-opacity duration-1000 ${
              isNight
                ? 'opacity-100 shadow-[0_0_10px_#fde047]'
                : 'opacity-0'
            }`}
            aria-hidden="true"
          />
        </div>
      </Link>

      {/* Explicit Temple entry */}
      <Link
        href="/temple"
        className="absolute bottom-5 sm:bottom-7 left-1/2 -translate-x-1/2 z-40 rounded-full border border-white/60 bg-black/25 px-5 py-2.5 text-[10px] font-mono uppercase tracking-[0.2em] text-white backdrop-blur-md shadow-lg transition hover:bg-black/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
      >
        Enter the Temple →
      </Link>

      {/* Falling hearts */}
      {fallingHearts.map((heart) => (
        <div
          key={heart.id}
          className="absolute pointer-events-none z-30"
          style={{
            left: `${heart.x}px`,
            top: `${heart.y}px`,
            width: `${heart.size * 1.5}px`,
            height: `${heart.size * 1.5}px`,
            transform: `rotate(${Math.sin(heart.y * 0.05) * 20}deg)`,
          }}
          aria-hidden="true"
        >
          <Image
            src={ASSETS.heartRain}
            alt=""
            fill
            className="object-contain drop-shadow-[0_0_15px_rgba(255,100,100,0.7)]"
            draggable={false}
          />
        </div>
      ))}

      <style jsx global>{`
        @keyframes cloudsMove {
          0% {
            transform: translateX(0);
          }

          100% {
            transform: translateX(-50%);
          }
        }

        @keyframes spinSlow {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }

        @keyframes bounceSlow {
          0%,
          100% {
            transform: translateY(0);
          }

          50% {
            transform: translateY(-10px);
          }
        }

        .animate-clouds-move {
          animation: cloudsMove 45s linear infinite;
        }

        .animate-spin-slow {
          animation: spinSlow 35s linear infinite;
        }

        .animate-bounce-slow {
          animation: bounceSlow 4s ease-in-out infinite;
        }
      `}</style>
    </main>
  );
}