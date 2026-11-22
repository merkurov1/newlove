'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowUpRight } from 'lucide-react';
import PierrotSectionLink from '@/components/pierrot/PierrotSectionLink';
import type { PierrotSectionId } from '@/lib/pierrot/navigation';

interface NavItem {
  label: string;
  href: string;
  sectionId: PierrotSectionId;
}

const INITIAL_ITEMS: NavItem[] = [
  { label: 'Art', href: '/heartandangel', sectionId: 'art' },
  { label: 'Selection', href: '/selection', sectionId: 'selection' },
  { label: 'Advising', href: '/advising', sectionId: 'advising' },
];

export default function HomeClient() {
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
    <div className="light-gallery min-h-screen w-full bg-[#F5F2EB] text-[#1D1B18] font-sans selection:bg-[#1D1B18] selection:text-[#F5F2EB] flex flex-col justify-between px-5 sm:px-12 pt-32 md:pt-44 pb-12 antialiased relative overflow-x-hidden">
      {/* Subtle Paper Grain Overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' fill='white'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Content Wrapper */}
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center justify-center my-auto text-center z-25 space-y-10 py-6">
        <p className="font-serif italic text-[#6F6A60] text-sm sm:text-lg md:text-xl mb-6 sm:mb-10 tracking-wide font-normal max-w-lg mx-auto px-2">
          Structure is the antidote to chaos.
        </p>

        <h1 className="lg-display text-balance text-3xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-normal tracking-tight leading-[1.15] sm:leading-[0.98] text-[#1D1B18] mb-10 sm:mb-16 px-1 [hyphens:none] break-words">
          Context Architecture <br className="hidden sm:inline" />
          <span className="text-[#847E73] italic font-serif">&amp; Cultural Capital</span>
        </h1>

        <nav
          onClick={shuffleItems}
          className="flex flex-wrap justify-center gap-3 sm:gap-8 md:gap-12 items-center font-mono text-xs sm:text-sm md:text-base uppercase tracking-[0.2em] mb-10 px-2 cursor-pointer select-none"
          title="Click or shake to shuffle"
        >
          {items.map((item) => (
            <PierrotSectionLink
              key={item.label}
              href={item.href}
              sectionId={item.sectionId}
              onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
                event.stopPropagation();
              }}
              className="group inline-flex items-center gap-2 py-2 text-[#1D1B18] hover:text-[#6F6A60] transition-colors"
            >
              <span className="font-medium tracking-[0.2em] underline underline-offset-8 decoration-[#1D1B18]/25 group-hover:decoration-[#1D1B18] transition-colors">
                {item.label}
              </span>
            </PierrotSectionLink>
          ))}
        </nav>

        <div className="flex flex-col items-center gap-4">
          <PierrotSectionLink
            href="/lobby"
            sectionId="lobby"
            className="group inline-flex items-center gap-3 rounded-full border border-[#1D1B18]/15 bg-white/55 px-7 py-3.5 text-[#1D1B18] shadow-[0_18px_50px_rgba(58,46,30,0.08)] backdrop-blur-md transition-all duration-300 ease-out hover:bg-[#1D1B18] hover:text-[#F5F2EB] sm:px-8 sm:py-4"
          >
            <span className="font-serif text-base sm:text-lg italic font-normal tracking-wide px-1">
              Enter The Lobby
            </span>
            <ArrowUpRight
              size={18}
              className="text-[#6F6A60] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#F5F2EB]"
            />
          </PierrotSectionLink>

          <PierrotSectionLink
            href="/journal"
            sectionId="journal"
            className="group inline-flex items-center gap-3 rounded-full border border-[#1D1B18]/15 bg-white/55 px-7 py-3.5 text-[#1D1B18] shadow-[0_18px_50px_rgba(58,46,30,0.08)] backdrop-blur-md transition-all duration-300 ease-out hover:bg-[#1D1B18] hover:text-[#F5F2EB] sm:px-8 sm:py-4"
          >
            <span className="font-serif text-base sm:text-lg italic font-normal tracking-wide px-1">
              Journal
            </span>
            <ArrowUpRight
              size={18}
              className="text-[#6F6A60] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#F5F2EB]"
            />
          </PierrotSectionLink>
        </div>
      </div>
    </div>
  );
}
