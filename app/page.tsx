'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
}

const INITIAL_ITEMS: NavItem[] = [
  { label: 'Art', href: '/heartandangel' },
  { label: 'Selection', href: '/selection' },
  { label: 'Advising', href: '/advising' },
];

export default function Home() {
  const [items, setItems] = useState<NavItem[]>(INITIAL_ITEMS);
  const [isShuffled, setIsShuffled] = useState(false);

  const shuffleItems = useCallback(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('medium');
    }

    if (isShuffled) {
      setItems(INITIAL_ITEMS);
      setIsShuffled(false);
    } else {
      const shuffled = [...items].sort(() => Math.random() - 0.5);
      setItems(shuffled);
      setIsShuffled(true);
    }
  }, [isShuffled, items]);

  useEffect(() => {
    let lastX = 0;
    let lastY = 0;
    let lastZ = 0;
    const threshold = 25;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity;
      if (!acceleration) return;

      const x = acceleration.x ?? 0;
      const y = acceleration.y ?? 0;
      const z = acceleration.z ?? 0;

      const deltaX = Math.abs(x - lastX);
      const deltaY = Math.abs(y - lastY);
      const deltaZ = Math.abs(z - lastZ);

      if (deltaX + deltaY + deltaZ > threshold) {
        shuffleItems();
      }

      lastX = x;
      lastY = y;
      lastZ = z;
    };

    if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
      window.addEventListener('devicemotion', handleMotion as EventListener);
    }

    return () => {
      if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
        window.removeEventListener('devicemotion', handleMotion as EventListener);
      }
    };
  }, [shuffleItems]);

  return (
    <>
      <Head>
        <link rel="canonical" href="https://www.merkurov.love" />
      </Head>
      <main className="min-h-screen w-full bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] flex flex-col justify-between px-5 sm:px-12 pt-32 md:pt-44 pb-12 antialiased relative overflow-x-hidden">
        
        {/* Subtle Paper Grain Overlay */}
        <div
          className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Content Wrapper */}
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center justify-center my-auto text-center z-25 space-y-10 py-6">
          
          <p className="font-serif italic text-zinc-600 text-sm sm:text-lg md:text-xl mb-6 sm:mb-10 tracking-wide font-normal max-w-lg mx-auto px-2">
            Structure is the antidote to chaos.
          </p>

          <h1 className="text-3xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-normal tracking-tight leading-[1.15] sm:leading-[0.98] text-[#111111] mb-10 sm:mb-16 px-1 [hyphens:none] break-words">
            Context Architecture <br className="hidden sm:inline" />
            <span className="text-zinc-500 italic font-serif">&amp; Cultural Capital</span>
          </h1>

          <nav 
            onClick={shuffleItems}
            className="flex flex-wrap justify-center gap-3 sm:gap-8 md:gap-12 items-center font-mono text-xs sm:text-sm md:text-base uppercase tracking-[0.2em] mb-10 px-2 cursor-pointer select-none"
            title="Click or shake to shuffle"
          >
            {items.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={(e: any) => e.stopPropagation()}
                className="group inline-flex items-center gap-2 py-2 text-[#111111] hover:text-zinc-600 transition-colors"
              >
                <span className="font-medium tracking-[0.2em] underline underline-offset-8 decoration-zinc-300 group-hover:decoration-black transition-colors">
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>

          <div>
            <Link
              href="/lobby"
              className="group inline-flex items-center gap-3 border border-zinc-900/20 bg-white/80 hover:bg-[#111111] text-[#111111] hover:text-[#FAF8F5] px-7 py-3.5 sm:px-8 sm:py-4 transition-all duration-300 ease-out backdrop-blur-sm shadow-sm rounded-full"
            >
              <span className="font-serif text-base sm:text-lg italic font-normal tracking-wide px-1">
                Enter The Lobby
              </span>
              <ArrowUpRight
                size={18}
                className="text-zinc-600 group-hover:text-[#FAF8F5] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300"
              />
            </Link>
          </div>

        </div>

        <div />

      </main>
    </>
  );
}
